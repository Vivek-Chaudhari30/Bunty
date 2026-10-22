import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mergeIdentity, mergePersonality } from "./set-bunty-identity.ts";

const dir = join(import.meta.dir, "bunty-identity");
const buntyIdentity = readFileSync(join(dir, "IDENTITY.md"), "utf-8");
const personality = readFileSync(join(dir, "PERSONALITY.md"), "utf-8");
const vellumSoul = readFileSync(
  join(import.meta.dir, "../../vellum/assistant/src/prompts/templates/SOUL.md"),
  "utf-8",
);

describe("mergeIdentity", () => {
  test("sets the fields and keeps the rest", () => {
    const current =
      "# IDENTITY.md\n\n- **Name:** Chintu\n- **Emoji:** _(not yet chosen)_\n\n## Avatar\nA blue circle.\n";
    const out = mergeIdentity(current, buntyIdentity);
    expect(out).toContain("- **Name:** Bunty");
    expect(out).not.toContain("Chintu");
    expect(out).toContain("- **Role:**");
    expect(out).toContain("## Avatar\nA blue circle.");
  });

  test("is idempotent", () => {
    const once = mergeIdentity(buntyIdentity, buntyIdentity);
    expect(mergeIdentity(once, buntyIdentity)).toBe(once);
  });
});

describe("mergePersonality", () => {
  test("replaces only the Personality section of the Vellum template", () => {
    const out = mergePersonality(vellumSoul, personality);
    expect(out).toContain("You are Bunty");
    expect(out).not.toContain("sarcastic. You can be a playfully rude");
    expect(out).toContain("## Boundaries");
    expect(out).toContain("## Working with [User]");
    expect(out.indexOf("## Personality")).toBe(out.lastIndexOf("## Personality"));
  });

  test("is idempotent", () => {
    const once = mergePersonality(vellumSoul, personality);
    expect(mergePersonality(once, personality)).toBe(once);
  });

  test("adds the section when SOUL.md has none", () => {
    const out = mergePersonality("# SOUL.md\n\n## Working with Owner A\nShort replies.\n", personality);
    expect(out.indexOf("## Personality")).toBeLessThan(out.indexOf("## Working with"));
  });
});
