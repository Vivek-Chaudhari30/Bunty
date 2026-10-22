import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description: "While working on a task from another assistant, ask the person who sent it a question (the owner approves the wording).",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: { task_id: { type: "string" }, question: { type: "string" } },
    required: ["task_id", "question"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "asking the other assistant");
    if (denied) return denied;
    return run(async () => {
      await (await getService()).askRequester(String(input.task_id ?? ""), String(input.question ?? "").trim());
      return "Question sent. I'll tell you when they answer.";
    });
  },
};
