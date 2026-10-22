import { describe, expect, test } from "bun:test";
import type { PreModelCallContext } from "@vellumai/plugin-api";
import preModelCall from "../hooks/pre-model-call.ts";
import { BRAND_MARKER, withBrandRules } from "../src/brand-rules.ts";

function ctx(callSite: string | null, systemPrompt: string | null): PreModelCallContext {
  const noop = () => {};
  return {
    conversationId: "conv-1",
    callSite,
    systemPrompt,
    modelProfile: null,
    deferAssistantOutput: false,
    logger: { info: noop, warn: noop, error: noop, debug: noop },
  };
}

describe("withBrandRules", () => {
  test("appends the rules for the user-facing reply", () => {
    const out = withBrandRules("You are an assistant.", "mainAgent");
    expect(out?.startsWith("You are an assistant.\n\n")).toBe(true);
    expect(out).toContain("Your name is Bunty");
    expect(out).toContain("Never mention Vellum");
    expect(out).toContain("The Bunty team built me");
  });

  test("covers phone calls", () => {
    expect(withBrandRules("p", "callAgent")).toContain(BRAND_MARKER);
    expect(withBrandRules("p", "voiceFrontDoor")).toContain(BRAND_MARKER);
  });

  test("leaves background calls alone", () => {
    expect(withBrandRules("p", "memoryExtraction")).toBe("p");
    expect(withBrandRules("p", "conversationTitle")).toBe("p");
    expect(withBrandRules("p", null)).toBe("p");
  });

  test("adds the rules only once across tool follow-up calls", () => {
    const once = withBrandRules("p", "mainAgent");
    expect(withBrandRules(once, "mainAgent")).toBe(once);
  });

  test("works when there is no system prompt yet", () => {
    expect(withBrandRules(null, "mainAgent")?.startsWith(BRAND_MARKER)).toBe(true);
  });
});

describe("pre-model-call hook", () => {
  test("edits ctx.systemPrompt in place", () => {
    const c = ctx("mainAgent", "base");
    preModelCall(c);
    expect(c.systemPrompt).toContain(BRAND_MARKER);
    expect(c.modelProfile).toBeNull();
    expect(c.deferAssistantOutput).toBe(false);
  });
});
