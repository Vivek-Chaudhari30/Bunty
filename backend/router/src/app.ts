// The router's HTTP handler. Pure: everything outside comes in through `deps`,
// so tests run it with an in-memory store and mock adapters.
import type { Forwarder, WhatsAppSender } from "./adapters.ts";
import type { RouterConfig } from "./config.ts";
import { last4, toE164 } from "./phone.ts";
import { signMeta, verifyInternal, verifyMeta, verifyTwilio } from "./signatures.ts";
import type { RouterStore, UserRow } from "./store.ts";
import { redirectTo, sayAndHangUp } from "./twiml.ts";
import { counterparties, hasIncomingMessage, payloadFor, type MetaWebhook } from "./whatsapp-payload.ts";

export interface RouterDeps {
  config: RouterConfig;
  store: RouterStore;
  whatsapp: WhatsAppSender;
  forwarder: Forwarder;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
  now?: () => number;
}

export const ONBOARDING_WHATSAPP = (url: string) =>
  `Hi! This number is a personal assistant. To get your own, sign up here: ${url}`;
export const ONBOARDING_CALL =
  "Hello. This number is a personal assistant service. To sign up, please send us a WhatsApp message on this number. Goodbye.";
export const PAUSED_CALL = "Your assistant is paused right now. Please try again later. Goodbye.";

type Target = { kind: "assistant"; user: UserRow } | { kind: "unknown" } | { kind: "paused" };

export function createRouter(deps: RouterDeps): (req: Request) => Promise<Response> {
  const { config, store, whatsapp, forwarder } = deps;
  const log = deps.log ?? (() => {});
  const now = deps.now ?? Date.now;

  /** Who should get traffic from this number: their own assistant, or the one that contacted them. */
  function resolve(phone: string): Target {
    const user = store.getUser(phone);
    if (user) return user.status === "active" ? { kind: "assistant", user } : { kind: "paused" };
    const stickyAssistant = store.getSticky(phone, now());
    if (stickyAssistant) {
      const owner = store.getAssistant(stickyAssistant);
      if (owner && owner.status === "active") return { kind: "assistant", user: owner };
    }
    return { kind: "unknown" };
  }

  async function handleWhatsApp(req: Request): Promise<Response> {
    const raw = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    if (!verifyMeta(raw, signature, config.whatsappAppSecret)) {
      log("whatsapp.bad_signature");
      return new Response("bad signature", { status: 401 });
    }
    let payload: MetaWebhook;
    try {
      payload = JSON.parse(raw) as MetaWebhook;
    } catch {
      return new Response("bad json", { status: 400 });
    }

    const numbers = counterparties(payload);
    const targets = numbers.map((n) => ({ number: n, target: resolve(n) }));
    const routed = targets.filter((t) => t.target.kind === "assistant") as Array<{
      number: string;
      target: { kind: "assistant"; user: UserRow };
    }>;
    const assistantIds = new Set(routed.map((t) => t.target.user.assistant_id));

    let failed = false;
    const send = async (user: UserRow, body: string, sig: string) => {
      const url = `${user.assistant_base_url}/webhooks/whatsapp`;
      try {
        const { status } = await forwarder.forward(url, body, {
          "content-type": "application/json",
          "x-hub-signature-256": sig,
        });
        if (status >= 500) failed = true;
        log("whatsapp.forwarded", { assistant: user.assistant_id, status });
      } catch (err) {
        failed = true;
        log("whatsapp.forward_error", { assistant: user.assistant_id, error: String(err) });
      }
    };

    if (routed.length === numbers.length && assistantIds.size === 1) {
      // Common case: everything is for one assistant. Forward the raw body and Meta's
      // own signature unchanged, so the gateway's check sees exactly what Meta sent.
      await send(routed[0]!.target.user, raw, signature!);
    } else {
      // Batched webhook for several people: split it and re-sign each part with the
      // shared app secret (every assistant is configured with the same one).
      for (const t of routed) {
        const part = JSON.stringify(payloadFor(payload, t.number));
        await send(t.target.user, part, signMeta(part, config.whatsappAppSecret));
      }
    }

    for (const t of targets) {
      if (t.target.kind === "assistant" || !hasIncomingMessage(payload, t.number)) continue;
      if (t.target.kind === "unknown" && store.claimOnboardingReply(t.number, now())) {
        try {
          await whatsapp.sendText(t.number, ONBOARDING_WHATSAPP(config.onboardingUrl));
          log("whatsapp.onboarding_sent", { to: last4(t.number) });
        } catch (err) {
          log("whatsapp.onboarding_error", { to: last4(t.number), error: String(err) });
        }
      }
    }

    // A 5xx makes Meta retry the whole webhook; gateways drop duplicate message ids.
    return new Response(failed ? "forward failed" : "ok", { status: failed ? 502 : 200 });
  }

  function handleWhatsAppVerify(url: URL): Response {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === config.whatsappVerifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  async function handleVoice(req: Request): Promise<Response> {
    const form = await req.formData();
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = String(v);
    const signedUrl = `${config.publicBaseUrl}/twilio/voice`;
    if (!verifyTwilio(signedUrl, params, req.headers.get("x-twilio-signature"), config.twilioAuthToken)) {
      log("voice.bad_signature");
      return new Response("bad signature", { status: 401 });
    }
    const from = params.From ? toE164(params.From) : null;
    const target = from ? resolve(from) : ({ kind: "unknown" } as Target);
    log("voice.incoming", { from: from ? last4(from) : "none", target: target.kind });
    if (target.kind === "assistant") return redirectTo(`${target.user.assistant_base_url}/webhooks/twilio/voice`);
    if (target.kind === "paused") return sayAndHangUp(PAUSED_CALL);
    return sayAndHangUp(ONBOARDING_CALL);
  }

  async function readInternal(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
    const raw = await req.text();
    const ok = verifyInternal(
      raw,
      req.headers.get("x-bunty-timestamp"),
      req.headers.get("x-bunty-signature"),
      config.internalHmacKey,
      Math.floor(now() / 1000),
    );
    if (!ok) return { ok: false, res: new Response("bad signature", { status: 401 }) };
    try {
      return { ok: true, body: JSON.parse(raw) as Record<string, unknown> };
    } catch {
      return { ok: false, res: new Response("bad json", { status: 400 }) };
    }
  }

  /** An assistant says "I just messaged or called non-user X": X's replies come back to it for 24 h. */
  async function handleOutboundHint(req: Request): Promise<Response> {
    const r = await readInternal(req);
    if (!r.ok) return r.res;
    const assistantId = typeof r.body.assistantId === "string" ? r.body.assistantId : "";
    const counterparty = typeof r.body.counterparty === "string" ? toE164(r.body.counterparty) : null;
    if (!assistantId || !counterparty) return Response.json({ error: "need assistantId and counterparty" }, { status: 400 });
    if (!store.getAssistant(assistantId)) return Response.json({ error: "unknown assistant" }, { status: 404 });
    if (store.getUser(counterparty)) {
      // Another user: their replies must reach their own assistant (decision D-05). Use A2A instead.
      return Response.json({ ignored: true, reason: "counterparty is a user; use assistant-to-assistant" });
    }
    store.setSticky(counterparty, assistantId, now());
    log("hint.sticky", { assistant: assistantId, counterparty: last4(counterparty) });
    return Response.json({ ok: true });
  }

  /** Onboarding writes a user row: phone -> their assistant. */
  async function handleUpsertUser(req: Request): Promise<Response> {
    const r = await readInternal(req);
    if (!r.ok) return r.res;
    const phone = typeof r.body.phone === "string" ? toE164(r.body.phone) : null;
    const assistantId = typeof r.body.assistantId === "string" ? r.body.assistantId : "";
    const baseUrl = typeof r.body.assistantBaseUrl === "string" ? r.body.assistantBaseUrl : "";
    const status = r.body.status === "paused" ? "paused" : "active";
    if (!phone || !assistantId || !/^https?:\/\//.test(baseUrl)) {
      return Response.json({ error: "need phone, assistantId, assistantBaseUrl" }, { status: 400 });
    }
    store.upsertUser({ phone_e164: phone, assistant_id: assistantId, assistant_base_url: baseUrl, status }, now());
    log("user.upserted", { phone: last4(phone), assistant: assistantId });
    return Response.json({ ok: true });
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case "GET /healthz":
        return Response.json({ ok: true });
      case "GET /whatsapp":
        return handleWhatsAppVerify(url);
      case "POST /whatsapp":
        return handleWhatsApp(req);
      case "POST /twilio/voice":
        return handleVoice(req);
      case "POST /outbound-hint":
        return handleOutboundHint(req);
      case "POST /internal/users":
        return handleUpsertUser(req);
      default:
        return new Response("not found", { status: 404 });
    }
  };
}
