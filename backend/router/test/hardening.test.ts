import { describe, expect, test } from "bun:test";
import { MockWhatsAppSender } from "../src/adapters.ts";
import { BUSY_CALL, createRouter } from "../src/app.ts";
import { CALLS_PER_MINUTE, Metrics, WHATSAPP_PER_MINUTE } from "../src/limits.ts";
import { RouterStore } from "../src/store.ts";
import { config, internalRequest, MockForwarder, setup, voiceRequest, waMessage, waRequest, waWebhook } from "./helpers.ts";

describe("delete my data", () => {
  test("removes the user, their consent and every sticky route to their assistant", async () => {
    const r = setup();
    r.store.recordConsent("+910000000001", "recording", r.now());
    r.store.setSticky("+919999900001", "chintu", r.now());
    const res = await r.handle(internalRequest("/internal/users/delete", { phone: "+91 00000 00001" }, r.now()));
    expect(await res.json()).toEqual({ ok: true, deletedAssistantId: "chintu" });
    expect(r.store.getUser("+910000000001")).toBeNull();
    expect(r.store.getConsent("+910000000001")).toEqual([]);
    expect(r.store.getSticky("+919999900001", r.now())).toBeNull();
    expect(r.store.getUser("+910000000002")).not.toBeNull();
    expect(r.store.listAudit()[0]).toMatchObject({ action: "user_deleted", target_last4: "0001", assistant_id: "chintu" });
  });

  test("after deletion the number is treated as unknown", async () => {
    const r = setup();
    await r.handle(internalRequest("/internal/users/delete", { phone: "+910000000001" }, r.now()));
    await r.handle(waRequest(waWebhook([waMessage("910000000001")])));
    expect(r.forwarder.calls).toHaveLength(0);
    expect(r.whatsapp.sent).toHaveLength(1);
  });

  test("must be signed", async () => {
    const r = setup();
    const res = await r.handle(internalRequest("/internal/users/delete", { phone: "+910000000001" }, r.now(), "wrong"));
    expect(res.status).toBe(401);
    expect(r.store.getUser("+910000000001")).not.toBeNull();
  });
});

describe("consent", () => {
  test("is recorded with a time; unknown kinds are refused", async () => {
    const r = setup();
    expect((await r.handle(internalRequest("/internal/consent", { phone: "+910000000002", kind: "data_use" }, r.now()))).status).toBe(200);
    expect(r.store.getConsent("+910000000002")).toEqual([{ kind: "data_use", granted_at: r.now() }]);
    expect((await r.handle(internalRequest("/internal/consent", { phone: "+910000000002", kind: "marketing" }, r.now()))).status).toBe(400);
  });
});

describe("rate limits", () => {
  test("a number sending too many WhatsApps in a minute is dropped without a Meta retry", async () => {
    const r = setup();
    for (let i = 0; i < WHATSAPP_PER_MINUTE; i++) await r.handle(waRequest(waWebhook([waMessage("910000000001", `m${i}`)])));
    const res = await r.handle(waRequest(waWebhook([waMessage("910000000001", "over")])));
    expect(res.status).toBe(200);
    expect(r.forwarder.calls).toHaveLength(WHATSAPP_PER_MINUTE);
    r.advance(60_000);
    await r.handle(waRequest(waWebhook([waMessage("910000000001", "later")])));
    expect(r.forwarder.calls).toHaveLength(WHATSAPP_PER_MINUTE + 1);
  });

  test("a dropped sender's message is not forwarded inside someone else's batch", async () => {
    const r = setup();
    for (let i = 0; i < WHATSAPP_PER_MINUTE; i++) await r.handle(waRequest(waWebhook([waMessage("919999900001", `u${i}`)])));
    r.forwarder.calls.length = 0;
    r.store.setSticky("+919999900001", "chintu", r.now());
    await r.handle(waRequest(waWebhook([waMessage("910000000001", "a"), waMessage("919999900001", "b")])));
    expect(r.forwarder.calls).toHaveLength(1);
    expect(r.forwarder.calls[0]!.body).not.toContain("919999900001");
  });

  test("too many calls from one number hear a busy message", async () => {
    const r = setup();
    for (let i = 0; i < CALLS_PER_MINUTE; i++) await r.handle(voiceRequest({ From: "+910000000001", CallSid: `CA${i}` }));
    const res = await r.handle(voiceRequest({ From: "+910000000001", CallSid: "CAx" }));
    expect(await res.text()).toContain(BUSY_CALL);
  });
});

describe("audit and metrics", () => {
  test("onboarding replies are audited with the last 4 digits only", async () => {
    const r = setup();
    await r.handle(waRequest(waWebhook([waMessage("919999900001")])));
    const rows = r.store.listAudit();
    expect(rows[0]).toMatchObject({ action: "onboarding_whatsapp_sent", target_last4: "0001" });
    expect(JSON.stringify(rows)).not.toContain("9999900001");
  });

  test("metrics count events and carry no phone numbers", async () => {
    const metrics = new Metrics();
    const store = new RouterStore();
    store.upsertUser({ phone_e164: "+910000000001", assistant_id: "chintu", assistant_base_url: "https://chintu.example.com" });
    const handle = createRouter({ config, store, whatsapp: new MockWhatsAppSender(), forwarder: new MockForwarder(), metrics });
    await handle(waRequest(waWebhook([waMessage("910000000001")])));
    await handle(waRequest(waWebhook([waMessage("910000000001")]), "wrong"));
    const body = await (await handle(new Request("https://router.example.com/metrics"))).text();
    expect(body).toContain("bunty_router_whatsapp_forwarded_total 1");
    expect(body).toContain("bunty_router_whatsapp_bad_signature_total 1");
    expect(body).not.toContain("0000000001");
  });

  test("metrics can require a token", async () => {
    const handle = createRouter({
      config: { ...config, metricsToken: "m-token" },
      store: new RouterStore(),
      whatsapp: new MockWhatsAppSender(),
      forwarder: new MockForwarder(),
    });
    expect((await handle(new Request("https://router.example.com/metrics"))).status).toBe(401);
    const ok = await handle(new Request("https://router.example.com/metrics", { headers: { authorization: "Bearer m-token" } }));
    expect(ok.status).toBe(200);
  });
});
