import { describe, expect, test } from "bun:test";

import { hitKey, lineHasBrand } from "./check-brand.ts";

describe("lineHasBrand", () => {
  test("finds the name in user-facing strings", () => {
    expect(lineHasBrand("a.ts", '  title: "Trying to reach Vellum…",')).toBe(true);
    expect(lineHasBrand("a.json", '  "welcome": "Welcome to Vellum"')).toBe(true);
    expect(lineHasBrand("a.md", "Ask Vellum to set a reminder.")).toBe(true);
    expect(lineHasBrand("a.ts", "  label: `Vellum's managed voice`,")).toBe(true);
  });

  test("ignores identifiers, URLs and commands", () => {
    expect(lineHasBrand("a.ts", 'import { x } from "@vellumai/plugin-api";')).toBe(false);
    expect(lineHasBrand("a.ts", "const p = process.env.VELLUM_WORKSPACE_DIR;")).toBe(false);
    expect(lineHasBrand("a.ts", 'headers["X-Vellum-Token"] = t;')).toBe(false);
    expect(lineHasBrand("a.ts", 'await cdp.send("Vellum.createTab", {});')).toBe(false);
    expect(lineHasBrand("a.ts", "class VellumProvider {}")).toBe(false);
    expect(lineHasBrand("a.md", "See https://docs.vellum.ai/Vellum for more.")).toBe(false);
    expect(lineHasBrand("a.md", "Run `Vellum login` first.")).toBe(false);
    expect(lineHasBrand("a.ts", 'run("vellum wake")')).toBe(false);
  });

  test("ignores comments and logger lines in code", () => {
    expect(lineHasBrand("a.ts", "// Vellum keeps this in sync")).toBe(false);
    expect(lineHasBrand("a.ts", " * the Vellum daemon")).toBe(false);
    expect(lineHasBrand("a.ts", 'log.info({}, "Vellum started");')).toBe(false);
  });
});

describe("hitKey", () => {
  test("is the file plus the trimmed line, cut at 150 characters", () => {
    expect(hitKey("f.ts", "   Vellum  ")).toBe("f.ts|Vellum");
    expect(hitKey("f.ts", "x".repeat(200)).length).toBe("f.ts|".length + 150);
  });
});
