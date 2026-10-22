// Gates in the tool layer run before the service is touched, so they are testable
// without a Vellum assistant.
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const toolsDir = join(import.meta.dir, "..", "tools");
const base = { conversationId: "c1", workingDir: "/tmp" };

type Tool = { defaultRiskLevel: string; execute: (i: Record<string, unknown>, c: Record<string, unknown>) => Promise<{ isError: boolean; content: string }> };

async function load(name: string): Promise<Tool> {
  return (await import(join(toolsDir, `${name}.ts`))).default as Tool;
}

const ALL = readdirSync(toolsDir).map((f) => f.replace(/\.ts$/, ""));
/** Tools that send something to another assistant or change who we trust. */
const NEEDS_FRESH_APPROVAL = ALL.filter((n) => !["a2a_create_invite", "a2a_task_status", "a2a_deadline_sweep"].includes(n));

describe("tool gates", () => {
  test("every tool refuses a non-owner (peer or contact)", async () => {
    for (const name of ALL) {
      const r = await (await load(name)).execute({}, { ...base, trustClass: "trusted_contact" });
      expect(r.isError, name).toBe(true);
      expect(r.content, name).toContain("Only my owner");
    }
  });

  test("sending and trust-changing tools are high risk and need a fresh approval", async () => {
    for (const name of NEEDS_FRESH_APPROVAL) {
      const tool = await load(name);
      expect(tool.defaultRiskLevel, name).toBe("high");
      const r = await tool.execute({}, { ...base, trustClass: "guardian" });
      expect(r.isError, name).toBe(true);
      expect(r.content, name).toContain("approval");
    }
  });
});
