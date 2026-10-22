import { describe, expect, test } from "bun:test";

import { applyBrand, BRAND_NAME } from "./brand.js";

describe("applyBrand", () => {
  test("replaces the name in plain text", () => {
    expect(applyBrand("Vellum credits are exhausted. Add funds to your Vellum account.")).toBe(
      "Bunty credits are exhausted. Add funds to your Bunty account.",
    );
    expect(applyBrand("I am Vellum.")).toBe("I am Bunty.");
    expect(applyBrand("Vellum's managed voice, Vellum-managed route")).toBe(
      "Bunty's managed voice, Bunty-managed route",
    );
    expect(applyBrand("VELLUM")).toBe("BUNTY");
  });

  test("replaces the name in Hinglish, Hindi and Gujarati text", () => {
    expect(applyBrand("Main Vellum hoon, aapka assistant.")).toBe(
      "Main Bunty hoon, aapka assistant.",
    );
    expect(applyBrand("मैं वेलम हूँ।")).toBe("मैं बंटी हूँ।");
    expect(applyBrand("હું વેલમ છું.")).toBe("હું બંટી છું.");
  });

  test("replaces the name next to CJK text", () => {
    expect(applyBrand("登录Vellum平台")).toBe("登录Bunty平台");
  });

  test("leaves URLs and domains unchanged", () => {
    const text = "Read https://docs.vellum.ai/Vellum/setup or vellum.ai/pricing, or open vellum://workspace/a.pdf";
    expect(applyBrand(text)).toBe(text);
    expect(applyBrand("Vellum help: https://www.vellum.ai/Vellum")).toBe(
      "Bunty help: https://www.vellum.ai/Vellum",
    );
  });

  test("leaves text inside backticks unchanged", () => {
    expect(applyBrand("Run `Vellum login` to connect Vellum.")).toBe(
      "Run `Vellum login` to connect Bunty.",
    );
    const fence = "Vellum says:\n```\nVellum.createTab\n```";
    expect(applyBrand(fence)).toBe("Bunty says:\n```\nVellum.createTab\n```");
  });

  test("leaves identifiers and the lowercase command unchanged", () => {
    const text = "@vellumai/plugin-api VELLUM_WORKSPACE_DIR X-Vellum-Token VellumProvider vellum wake";
    expect(applyBrand(text)).toBe(text);
  });

  test("returns text without the name as is", () => {
    const text = "Kal subah 8 baje reminder set ho gaya.";
    expect(applyBrand(text)).toBe(text);
    expect(BRAND_NAME).toBe("Bunty");
  });
});
