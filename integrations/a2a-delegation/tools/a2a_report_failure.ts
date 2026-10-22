import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description: "Tell the assistant that sent a task that we can't finish it (or are dropping it), with a short reason.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: { task_id: { type: "string" }, reason: { type: "string" } },
    required: ["task_id", "reason"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "reporting a task as not done");
    if (denied) return denied;
    return run(async () => {
      await (await getService()).reportFailure(String(input.task_id ?? ""), String(input.reason ?? ""));
      return "They have been told.";
    });
  },
};
