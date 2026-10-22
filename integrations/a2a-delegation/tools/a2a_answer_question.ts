import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description: "Send the owner's answer to a question another assistant asked about a task we sent. Owner's words only.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: { task_id: { type: "string" }, answer: { type: "string" } },
    required: ["task_id", "answer"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "answering another assistant");
    if (denied) return denied;
    return run(async () => {
      await (await getService()).answerQuestion(String(input.task_id ?? ""), String(input.answer ?? "").trim());
      return "Answer sent.";
    });
  },
};
