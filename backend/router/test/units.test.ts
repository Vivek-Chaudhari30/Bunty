import { describe, expect, test } from "bun:test";
import { createWhatsAppSender, MetaWhatsAppSender, MockWhatsAppSender } from "../src/adapters.ts";
import { loadConfig } from "../src/config.ts";
import { NotConfiguredError } from "../src/errors.ts";
import { last4, toE164 } from "../src/phone.ts";
import { signInternal, signTwilio, verifyInternal, verifyMeta, verifyTwilio, signMeta } from "../src/signatures.ts";
import { RouterStore, STICKY_TTL_MS } from "../src/store.ts";
import { counterparties, payloadFor } from "../src/whatsapp-payload.ts";
import { waMessage, waWebhook } from "./helpers.ts";

describe("phone numbers", () => {
  test("normalizes the formats Meta, Twilio and people use", () => {
    expect(toE164("+91 00000 00001")).toBe("+910000000001");
    expect(toE164("910000000001")).toBe("+910000000001");
    expect(toE164("whatsapp:+910000000001")).toBe("+910000000001");
    expect(toE164("9876500001")).toBe("+919876500001");
    expect(toE164("+44 20 0000 0000")).toBe("+442000000000");
    expect(toE164("abc")).toBeNull();
    expect(toE164("12")).toBeNull();
  });

  test("logs show only the last 4 digits", () => {
    expect(last4("+910000000001")).toBe("***0001");
  });
});

describe("signatures", () => {
  test("Meta signature checks the exact raw body", () => {
    const sig = signMeta("{\"a\":1}", "s");
    expect(verifyMeta("{\"a\":1}", sig, "s")).toBe(true);
    expect(verifyMeta("{\"a\": 1}", sig, "s")).toBe(false);
    expect(verifyMeta("{\"a\":1}", sig, "other")).toBe(false);
    expect(verifyMeta("{\"a\":1}", null, "s")).toBe(false);
  });

  test("Twilio signature covers URL and sorted params", () => {
    const params = { From: "+910000000001", CallSid: "CA1", To: "+910000000000" };
    const sig = signTwilio("https://r.example.com/twilio/voice", params, "t");
    expect(verifyTwilio("https://r.example.com/twilio/voice", params, sig, "t")).toBe(true);
    expect(verifyTwilio("https://other.example.com/twilio/voice", params, sig, "t")).toBe(false);
    expect(verifyTwilio("https://r.example.com/twilio/voice", { ...params, From: "+1" }, sig, "t")).toBe(false);
  });

  test("internal signature rejects old timestamps", () => {
    const now = 1_700_000_000;
    const sig = signInternal("{}", now, "k");
    expect(verifyInternal("{}", String(now), sig, "k", now)).toBe(true);
    expect(verifyInternal("{}", String(now), sig, "k", now + 301)).toBe(false);
    expect(verifyInternal("{}", String(now), sig, "wrong", now)).toBe(false);
    expect(verifyInternal("{}", "abc", sig, "k", now)).toBe(false);
  });
});

describe("store", () => {
  test("sticky routes expire after 24 hours", () => {
    const s = new RouterStore();
    s.setSticky("+919999900001", "chintu", 0);
    expect(s.getSticky("+919999900001", STICKY_TTL_MS - 1)).toBe("chintu");
    expect(s.getSticky("+919999900001", STICKY_TTL_MS)).toBeNull();
    expect(s.pruneExpired(STICKY_TTL_MS)).toBe(1);
  });

  test("the latest assistant to write wins the sticky route", () => {
    const s = new RouterStore();
    s.setSticky("+919999900001", "chintu", 0);
    s.setSticky("+919999900001", "sujal", 10);
    expect(s.getSticky("+919999900001", 20)).toBe("sujal");
  });

  test("onboarding reply is claimed at most once per day", () => {
    const s = new RouterStore();
    expect(s.claimOnboardingReply("+919999900001", 0)).toBe(true);
    expect(s.claimOnboardingReply("+919999900001", 1000)).toBe(false);
    expect(s.claimOnboardingReply("+919999900001", STICKY_TTL_MS)).toBe(true);
  });

  test("consent is recorded with a time", () => {
    const s = new RouterStore();
    s.recordConsent("+910000000001", "recording", 5);
    expect(s.getConsent("+910000000001")).toEqual([{ kind: "recording", granted_at: 5 }]);
  });
});

describe("WhatsApp payload splitting", () => {
  test("finds senders and status recipients", () => {
    const p = waWebhook([waMessage("910000000001")], [{ id: "s1", recipient_id: "919999900001", status: "delivered" }]);
    expect(counterparties(p)).toEqual(["+910000000001", "+919999900001"]);
  });

  test("keeps only one person's items", () => {
    const p = waWebhook([waMessage("910000000001"), waMessage("910000000002")]);
    const part = payloadFor(p, "+910000000002");
    expect(counterparties(part)).toEqual(["+910000000002"]);
  });
});

describe("config and adapters", () => {
  test("missing secret names the variable", () => {
    expect(() => loadConfig({})).toThrow(NotConfiguredError);
    expect(() => loadConfig({})).toThrow(/ROUTER_WHATSAPP_APP_SECRET/);
  });

  test("mock sender by default, real sender needs its keys", () => {
    expect(createWhatsAppSender({})).toBeInstanceOf(MockWhatsAppSender);
    expect(() => createWhatsAppSender({ BUNTY_ADAPTERS: "real" })).toThrow(/WHATSAPP_ACCESS_TOKEN/);
    expect(() => new MetaWhatsAppSender({ WHATSAPP_ACCESS_TOKEN: "x" })).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
  });
});
