import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description: "Cancel a task we sent to another assistant. Their owner is told to stop.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: { task_id: { type: "string" }, reason: { type: "string" } },
    required: ["task_id"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "canceling a task");
    if (denied) return denied;
    return run(async () => {
      await (await getService()).cancelTask(String(input.task_id ?? ""), String(input.reason ?? ""));
      return "Canceled.";
    });
  },
};
