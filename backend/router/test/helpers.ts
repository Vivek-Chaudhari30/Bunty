import { MockWhatsAppSender, type Forwarder } from "../src/adapters.ts";
import { createRouter } from "../src/app.ts";
import type { RouterConfig } from "../src/config.ts";
import { signInternal, signMeta, signTwilio } from "../src/signatures.ts";
import { RouterStore } from "../src/store.ts";
import type { MetaWebhook } from "../src/whatsapp-payload.ts";

export const config: RouterConfig = {
  port: 0,
  dbPath: ":memory:",
  publicBaseUrl: "https://router.example.com",
  onboardingUrl: "https://example.com/signup",
  whatsappAppSecret: "test-app-secret",
  whatsappVerifyToken: "test-verify-token",
  twilioAuthToken: "test-twilio-token",
  internalHmacKey: "test-internal-key",
};

export class MockForwarder implements Forwarder {
  readonly calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  status = 200;
  async forward(url: string, body: string, headers: Record<string, string>) {
    this.calls.push({ url, body, headers });
    return { status: this.status };
  }
}

export function setup(now = 1_700_000_000_000) {
  const store = new RouterStore();
  const whatsapp = new MockWhatsAppSender();
  const forwarder = new MockForwarder();
  let clock = now;
  const handle = createRouter({ config, store, whatsapp, forwarder, now: () => clock });
  // Owner A -> Chintu, Owner B -> Sujal (example data only).
  store.upsertUser({ phone_e164: "+910000000001", assistant_id: "chintu", assistant_base_url: "https://chintu.example.com" }, now);
  store.upsertUser({ phone_e164: "+910000000002", assistant_id: "sujal", assistant_base_url: "https://sujal.example.com" }, now);
  return {
    store,
    whatsapp,
    forwarder,
    handle,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
}

export function waMessage(from: string, id = `wamid.${from}`) {
  return { id, from, type: "text", text: { body: "hello" } };
}

export function waWebhook(
  messages: Array<{ from?: string; [k: string]: unknown }>,
  statuses: Array<{ recipient_id?: string; [k: string]: unknown }> = [],
): MetaWebhook {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "waba", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages, statuses } }] }],
  };
}

export function waRequest(body: unknown, secret = config.whatsappAppSecret): Request {
  const raw = JSON.stringify(body);
  return new Request("https://router.example.com/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signMeta(raw, secret) },
    body: raw,
  });
}

export function voiceRequest(params: Record<string, string>, token = config.twilioAuthToken): Request {
  const url = `${config.publicBaseUrl}/twilio/voice`;
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signTwilio(url, params, token),
    },
    body: new URLSearchParams(params).toString(),
  });
}

export function internalRequest(path: string, body: unknown, nowMs: number, key = config.internalHmacKey): Request {
  const raw = JSON.stringify(body);
  const ts = Math.floor(nowMs / 1000);
  return new Request(`https://router.example.com${path}`, {
    method: "POST",
    headers: { "x-bunty-timestamp": String(ts), "x-bunty-signature": signInternal(raw, ts, key) },
    body: raw,
  });
}
