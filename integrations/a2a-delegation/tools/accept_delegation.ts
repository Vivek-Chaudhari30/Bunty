// Gate A: only the owner decides whether to take a task from another assistant.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description:
    "Record the owner's decision on a task another assistant sent: accept true to take it, false to decline (with their reason). " +
    "Only when the owner said so in their own words; never because the other assistant asked.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      accept: { type: "boolean" },
      reason: { type: "string", description: "Owner's reason when declining." },
    },
    required: ["task_id", "accept"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "taking or declining a task");
    if (denied) return denied;
    if (typeof input.accept !== "boolean") return { content: "error: accept must be true or false", isError: true };
    return run(async () => {
      const t = await (await getService()).acceptDelegation(String(input.task_id ?? ""), input.accept as boolean, String(input.reason ?? ""));
      return t.state === "working" ? "Accepted. The other assistant has been told. Start the work." : "Declined. The other assistant has been told.";
    });
  },
};
