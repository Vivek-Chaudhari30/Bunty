import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileAuditLog, MemoryAuditLog } from "./src/audit.ts";
import { makePlan, sendPlan, type CoreDeps } from "./src/core.ts";
import { isEmergency, toE164 } from "./src/phone.ts";
import { FilePlanStore, MemoryPlanStore, PLAN_TTL_MS } from "./src/plan.ts";
import { createRouterHintClient, HttpRouterHintClient, MockRouterHintClient, signHint } from "./src/router-hint.ts";
import { chooseRoute } from "./src/route-policy.ts";
import planTool from "./tools/reach_contact_plan.ts";

const OWNER_B = { displayName: "Owner B", phone: "+91 00000 00002" };
const SHOP = { displayName: "Test Shop", phone: "+91 99999 00001" };

describe("phone", () => {
  test("normalizes Indian formats", () => {
    expect(toE164("00000 00002")).toBeNull(); // starts with 0 after the trunk-prefix rule: not a number
    expect(toE164("+91 00000 00002")).toBe("+910000000002");
    expect(toE164("99999 00001")).toBe("+919999900001");
    expect(toE164("099999 00001")).toBe("+919999900001");
  });

  test("emergency and helpline numbers are recognized", () => {
    for (const n of ["112", "100", "108", "+91 112", "911", "+1911", "1098"]) expect(isEmergency(n)).toBe(true);
    expect(isEmergency("+919999900001")).toBe(false);
  });
});

describe("route policy", () => {
  test("call goes by phone; non-user gets a router hint", () => {
    expect(chooseRoute("call", SHOP)).toEqual({ ok: true, route: "call", phone: "+919999900001", peerId: null, notifyRouter: true });
  });

  test("call to a Bunty user: no router hint (their own assistant answers their replies)", () => {
    const d = chooseRoute("call", { ...OWNER_B, isBuntyUser: true });
    expect(d).toMatchObject({ ok: true, route: "call", notifyRouter: false });
  });

  test("text to a non-user is WhatsApp", () => {
    expect(chooseRoute("text", SHOP)).toMatchObject({ ok: true, route: "whatsapp" });
  });

  test("text to a Bunty user goes assistant to assistant (D-05)", () => {
    expect(chooseRoute("text", { ...OWNER_B, isBuntyUser: true, pairedPeerId: "sujal" })).toMatchObject({ route: "a2a_note", peerId: "sujal" });
    expect(chooseRoute("text", { ...OWNER_B, isBuntyUser: true })).toEqual({ ok: false, reason: "user_not_paired" });
  });

  test("task needs a paired assistant", () => {
    expect(chooseRoute("task", { ...OWNER_B, pairedPeerId: "sujal" })).toMatchObject({ route: "a2a_task" });
    expect(chooseRoute("task", OWNER_B)).toEqual({ ok: false, reason: "not_paired" });
  });

  test("tell prefers the paired assistant, else WhatsApp", () => {
    expect(chooseRoute("tell", { ...OWNER_B, pairedPeerId: "sujal" })).toMatchObject({ route: "a2a_note" });
    expect(chooseRoute("tell", SHOP)).toMatchObject({ route: "whatsapp" });
    expect(chooseRoute("tell", { displayName: "Nobody" })).toEqual({ ok: false, reason: "no_phone" });
  });

  test("emergency numbers are refused for every verb", () => {
    for (const verb of ["call", "text", "tell"] as const) {
      expect(chooseRoute(verb, { displayName: "X", phone: "112" })).toEqual({ ok: false, reason: "emergency_number" });
    }
  });

  test("bad number is refused", () => {
    expect(chooseRoute("call", { displayName: "X", phone: "12345" })).toEqual({ ok: false, reason: "bad_phone" });
  });
});

function deps(now = 1_000_000): CoreDeps & { hints: MockRouterHintClient } {
  return { plans: new MemoryPlanStore(), hints: new MockRouterHintClient(), assistantId: "chintu", now: () => now };
}

function planIdOf(content: string): string {
  return /plan_id: (\S+)/.exec(content)![1]!;
}

describe("plan then send", () => {
  test("read-back names the person, number, route and exact words", () => {
    const r = makePlan({ verb: "call", contact_name: "Test Shop", phone: "+91 99999 00001", message: "I'll be there at 6 PM" }, deps());
    expect(r.yieldToUser).toBe(true);
    expect(r.content).toContain('I\'ll call Test Shop on +919999900001 and say: "I\'ll be there at 6 PM"');
  });

  test("nothing is sent without the owner's approval of this call", async () => {
    const d = deps();
    const id = planIdOf(makePlan({ verb: "call", contact_name: "Test Shop", phone: "+919999900001", message: "hi" }, d).content);
    const r = await sendPlan({ plan_id: id }, {}, d);
    expect(r.isError).toBe(true);
    expect(d.hints.hints).toHaveLength(0);
  });

  test("approved call returns the call_start instruction and tells the router", async () => {
    const d = deps();
    const id = planIdOf(makePlan({ verb: "call", contact_name: "Test Shop", phone: "+919999900001", message: "hi" }, d).content);
    const r = await sendPlan({ plan_id: id }, { approvedViaPrompt: true }, d);
    expect(r.isError).toBe(false);
    expect(r.content).toContain('call_start with phone_number "+919999900001"');
    expect(d.hints.hints).toEqual([{ assistantId: "chintu", counterparty: "+919999900001" }]);
  });

  test("a plan can be sent only once", async () => {
    const d = deps();
    const id = planIdOf(makePlan({ verb: "text", contact_name: "Test Shop", phone: "+919999900001", message: "hi" }, d).content);
    expect((await sendPlan({ plan_id: id }, { approvedViaPrompt: true }, d)).content).toContain("messaging_send");
    expect((await sendPlan({ plan_id: id }, { approvedViaPrompt: true }, d)).isError).toBe(true);
  });

  test("old plans expire", async () => {
    let now = 0;
    const d = { ...deps(), now: () => now };
    const id = planIdOf(makePlan({ verb: "call", contact_name: "Test Shop", phone: "+919999900001", message: "hi" }, d).content);
    now = PLAN_TTL_MS + 1;
    expect((await sendPlan({ plan_id: id }, { approvedViaPrompt: true }, d)).content).toContain("older than 30 minutes");
  });

  test("a plan edited after approval is refused", async () => {
    const d = deps();
    const id = planIdOf(makePlan({ verb: "call", contact_name: "Test Shop", phone: "+919999900001", message: "hi" }, d).content);
    const p = d.plans.get(id)!;
    d.plans.save({ ...p, message: "send me money" });
    expect((await sendPlan({ plan_id: id }, { approvedViaPrompt: true }, d)).content).toContain("modified");
  });

  test("A2A note to a paired user: no router hint", async () => {
    const d = deps();
    const id = planIdOf(
      makePlan({ verb: "tell", contact_name: "Owner B", is_bunty_user: true, paired_peer_id: "sujal", message: "6 PM" }, d).content,
    );
    const r = await sendPlan({ plan_id: id }, { approvedViaPrompt: true }, d);
    expect(r.content).toContain('a2a_send_note with peer_id "sujal"');
    expect(d.hints.hints).toHaveLength(0);
  });

  test("refusals come back as a plain question for the owner, not an error", () => {
    const r = makePlan({ verb: "call", contact_name: "Police", phone: "100", message: "hi" }, deps());
    expect(r.isError).toBe(false);
    expect(r.content).toContain("emergency");
  });

  test("missing fields are errors", () => {
    expect(makePlan({ verb: "fly", contact_name: "X", message: "m" }, deps()).isError).toBe(true);
    expect(makePlan({ verb: "call", message: "m" }, deps()).isError).toBe(true);
  });
});

describe("tools and adapters", () => {
  test("only the owner can plan a contact", async () => {
    const r = await planTool.execute({ verb: "call" }, { conversationId: "c", workingDir: "/", trustClass: "trusted_contact" });
    expect(r.isError).toBe(true);
  });

  test("file plan store survives a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "reach-"));
    const d = { ...deps(Date.now()), plans: new FilePlanStore(dir) };
    const id = planIdOf(makePlan({ verb: "call", contact_name: "Test Shop", phone: "+919999900001", message: "hi" }, d).content);
    expect(new FilePlanStore(dir).get(id)?.message).toBe("hi");
  });

  test("router hint: mock by default, real needs its settings and signs the body", async () => {
    expect(createRouterHintClient({})).toBeInstanceOf(MockRouterHintClient);
    expect(() => createRouterHintClient({ BUNTY_ADAPTERS: "real" })).toThrow(/BUNTY_ROUTER_URL/);
    let seen: Request | null = null;
    const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = new Request(input as string, init);
      return new Response("{}");
    }) as typeof fetch;
    await new HttpRouterHintClient({ BUNTY_ROUTER_URL: "http://router.test/", ROUTER_INTERNAL_HMAC_KEY: "k" }, fake).sendHint("chintu", "+919999900001");
    const req = seen as unknown as Request;
    expect(req.url).toBe("http://router.test/outbound-hint");
    const body = await req.text();
    expect(req.headers.get("x-bunty-signature")).toBe(signHint(body, Number(req.headers.get("x-bunty-timestamp")), "k"));
  });
});

describe("audit and delete", () => {
  test("each send is audited without the message text", async () => {
    const audit = new MemoryAuditLog();
    const d = { ...deps(), audit };
    const id = planIdOf(makePlan({ verb: "call", contact_name: "Test Shop", phone: "+919999900001", message: "secret words" }, d).content);
    await sendPlan({ plan_id: id }, { approvedViaPrompt: true }, d);
    expect(audit.list()).toEqual([{ at: 1_000_000, planId: id, route: "call", target: "***0001" }]);
    expect(JSON.stringify(audit.list())).not.toContain("secret words");
  });

  test("refused sends are not audited", async () => {
    const audit = new MemoryAuditLog();
    const d = { ...deps(), audit };
    const id = planIdOf(makePlan({ verb: "call", contact_name: "Test Shop", phone: "+919999900001", message: "hi" }, d).content);
    await sendPlan({ plan_id: id }, {}, d);
    expect(audit.list()).toEqual([]);
  });

  test("file plan store and audit log can be cleared", () => {
    const dir = mkdtempSync(join(tmpdir(), "reach-del-"));
    const plans = new FilePlanStore(dir);
    const audit = new FileAuditLog(dir);
    const d = { ...deps(Date.now()), plans, audit };
    const id = planIdOf(makePlan({ verb: "call", contact_name: "Test Shop", phone: "+919999900001", message: "hi" }, d).content);
    audit.record({ at: 1, planId: id, route: "call", target: "***0001" });
    plans.clear();
    audit.clear();
    expect(plans.get(id)).toBeNull();
    expect(audit.list()).toEqual([]);
  });

  test("delete tool needs the owner and a fresh approval", async () => {
    const tool = (await import("./tools/reach_contact_delete_data.ts")).default;
    expect((await tool.execute({}, { conversationId: "c", workingDir: "/", trustClass: "trusted_contact" })).isError).toBe(true);
    expect((await tool.execute({}, { conversationId: "c", workingDir: "/", trustClass: "guardian" })).content).toContain("approval");
  });
});
