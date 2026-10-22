// "Delete my data" for this plugin: saved plans and the audit log.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { runtimeDeps } from "../src/runtime.ts";

export default {
  description: "Owner asked to delete their data: remove saved reach plans and the log of calls and messages sent. Cannot be undone.",
  defaultRiskLevel: "high" as const,
  input_schema: { type: "object", properties: {} },
  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    if (ctx.trustClass !== "guardian") return { content: "Only the owner can do this.", isError: true };
    if (ctx.approvedViaPrompt !== true) {
      return { content: "Not done: deleting data needs the owner's approval in the prompt for this exact call.", isError: true };
    }
    const deps = await runtimeDeps();
    deps.plans.clear();
    deps.audit?.clear();
    return { content: "Deleted saved plans and the send log.", isError: false };
  },
};
