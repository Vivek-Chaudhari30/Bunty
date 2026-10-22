import { describe, expect, test } from "bun:test";
import { ONBOARDING_CALL, PAUSED_CALL } from "../src/app.ts";
import { verifyMeta } from "../src/signatures.ts";
import { STICKY_TTL_MS } from "../src/store.ts";
import { counterparties } from "../src/whatsapp-payload.ts";
import { config, internalRequest, setup, voiceRequest, waMessage, waRequest, waWebhook } from "./helpers.ts";

describe("WhatsApp routing", () => {
  test("known user: raw body and Meta's signature are forwarded unchanged", async () => {
    const r = setup();
    const req = waRequest(waWebhook([waMessage("910000000001")]));
    const sig = req.headers.get("x-hub-signature-256");
    const raw = await req.clone().text();
    const res = await r.handle(req);
    expect(res.status).toBe(200);
    expect(r.forwarder.calls).toHaveLength(1);
    expect(r.forwarder.calls[0]!.url).toBe("https://chintu.example.com/webhooks/whatsapp");
    expect(r.forwarder.calls[0]!.body).toBe(raw);
    expect(r.forwarder.calls[0]!.headers["x-hub-signature-256"]).toBe(sig!);
  });

  test("forged signature is rejected and nothing is forwarded", async () => {
    const r = setup();
    const res = await r.handle(waRequest(waWebhook([waMessage("910000000001")]), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(r.forwarder.calls).toHaveLength(0);
  });

  test("two teammates on the same shared number reach their own assistants", async () => {
    const r = setup();
    await r.handle(waRequest(waWebhook([waMessage("910000000001")])));
    await r.handle(waRequest(waWebhook([waMessage("910000000002")])));
    expect(r.forwarder.calls.map((c) => c.url)).toEqual([
      "https://chintu.example.com/webhooks/whatsapp",
      "https://sujal.example.com/webhooks/whatsapp",
    ]);
  });

  test("batched webhook is split per person and each part is re-signed", async () => {
    const r = setup();
    await r.handle(waRequest(waWebhook([waMessage("910000000001"), waMessage("910000000002")])));
    expect(r.forwarder.calls).toHaveLength(2);
    for (const call of r.forwarder.calls) {
      expect(verifyMeta(call.body, call.headers["x-hub-signature-256"]!, config.whatsappAppSecret)).toBe(true);
      expect(counterparties(JSON.parse(call.body))).toHaveLength(1);
    }
  });

  test("unknown number gets one onboarding reply and no assistant", async () => {
    const r = setup();
    await r.handle(waRequest(waWebhook([waMessage("919999900001", "m1")])));
    await r.handle(waRequest(waWebhook([waMessage("919999900001", "m2")])));
    expect(r.forwarder.calls).toHaveLength(0);
    expect(r.whatsapp.sent).toHaveLength(1);
    expect(r.whatsapp.sent[0]!.to).toBe("+919999900001");
    expect(r.whatsapp.sent[0]!.text).toContain(config.onboardingUrl);
  });

  test("delivery status for an unknown number sends no onboarding reply", async () => {
    const r = setup();
    await r.handle(waRequest(waWebhook([], [{ id: "s1", recipient_id: "919999900001", status: "delivered" }])));
    expect(r.whatsapp.sent).toHaveLength(0);
  });

  test("non-user replies go back to the assistant that messaged them, for 24 h", async () => {
    const r = setup();
    const hint = await r.handle(
      internalRequest("/outbound-hint", { assistantId: "chintu", counterparty: "+91 99999 00001" }, r.now()),
    );
    expect(hint.status).toBe(200);
    await r.handle(waRequest(waWebhook([waMessage("919999900001", "m1")])));
    expect(r.forwarder.calls[0]!.url).toBe("https://chintu.example.com/webhooks/whatsapp");
    r.advance(STICKY_TTL_MS);
    await r.handle(waRequest(waWebhook([waMessage("919999900001", "m2")])));
    expect(r.forwarder.calls).toHaveLength(1);
    expect(r.whatsapp.sent).toHaveLength(1);
  });

  test("assistant gateway down: 502 so Meta retries", async () => {
    const r = setup();
    r.forwarder.status = 503;
    const res = await r.handle(waRequest(waWebhook([waMessage("910000000001")])));
    expect(res.status).toBe(502);
  });

  test("Meta webhook verification answers the challenge only with the right token", async () => {
    const r = setup();
    const ok = await r.handle(
      new Request(`https://router.example.com/whatsapp?hub.mode=subscribe&hub.verify_token=${config.whatsappVerifyToken}&hub.challenge=123`),
    );
    expect(await ok.text()).toBe("123");
    const bad = await r.handle(
      new Request("https://router.example.com/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123"),
    );
    expect(bad.status).toBe(403);
  });
});

describe("call routing", () => {
  test("known caller is redirected to their assistant's gateway", async () => {
    const r = setup();
    const res = await r.handle(voiceRequest({ From: "+910000000002", To: "+910000000000", CallSid: "CA1" }));
    expect(res.headers.get("content-type")).toBe("text/xml");
    expect(await res.text()).toContain('<Redirect method="POST">https://sujal.example.com/webhooks/twilio/voice</Redirect>');
  });

  test("unknown caller hears the onboarding message", async () => {
    const r = setup();
    const res = await r.handle(voiceRequest({ From: "+919999900001", CallSid: "CA2" }));
    const body = await res.text();
    expect(body).toContain(ONBOARDING_CALL);
    expect(body).toContain("<Hangup/>");
  });

  test("non-user calling back reaches the assistant that called them", async () => {
    const r = setup();
    await r.handle(internalRequest("/outbound-hint", { assistantId: "sujal", counterparty: "+919999900001" }, r.now()));
    const res = await r.handle(voiceRequest({ From: "+919999900001", CallSid: "CA3" }));
    expect(await res.text()).toContain("https://sujal.example.com/webhooks/twilio/voice");
  });

  test("paused user is told so", async () => {
    const r = setup();
    r.store.upsertUser({ phone_e164: "+910000000001", assistant_id: "chintu", assistant_base_url: "https://chintu.example.com", status: "paused" });
    const res = await r.handle(voiceRequest({ From: "+910000000001", CallSid: "CA4" }));
    expect(await res.text()).toContain(PAUSED_CALL);
  });

  test("bad Twilio signature is rejected", async () => {
    const r = setup();
    const res = await r.handle(voiceRequest({ From: "+910000000001" }, "wrong"));
    expect(res.status).toBe(401);
  });
});

describe("internal endpoints", () => {
  test("hint for another user is ignored (use assistant-to-assistant)", async () => {
    const r = setup();
    const res = await r.handle(internalRequest("/outbound-hint", { assistantId: "chintu", counterparty: "+910000000002" }, r.now()));
    expect(await res.json()).toMatchObject({ ignored: true });
    expect(r.store.getSticky("+910000000002", r.now())).toBeNull();
  });

  test("unsigned or wrongly signed internal calls are rejected", async () => {
    const r = setup();
    const res = await r.handle(internalRequest("/outbound-hint", { assistantId: "chintu", counterparty: "+919999900001" }, r.now(), "wrong"));
    expect(res.status).toBe(401);
  });

  test("hint for an unknown assistant is refused", async () => {
    const r = setup();
    const res = await r.handle(internalRequest("/outbound-hint", { assistantId: "nobody", counterparty: "+919999900001" }, r.now()));
    expect(res.status).toBe(404);
  });

  test("onboarding writes a user row", async () => {
    const r = setup();
    const res = await r.handle(
      internalRequest("/internal/users", { phone: "+91 00000 00003", assistantId: "tester3", assistantBaseUrl: "https://t3.example.com/" }, r.now()),
    );
    expect(res.status).toBe(200);
    expect(r.store.getUser("+910000000003")).toMatchObject({ assistant_id: "tester3", assistant_base_url: "https://t3.example.com" });
  });

  test("healthz and unknown paths", async () => {
    const r = setup();
    expect((await r.handle(new Request("https://router.example.com/healthz"))).status).toBe(200);
    expect((await r.handle(new Request("https://router.example.com/nope"))).status).toBe(404);
  });
});
