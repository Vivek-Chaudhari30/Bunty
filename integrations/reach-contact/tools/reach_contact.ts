// Step 2: send an approved plan. High risk: the owner approves every call of this tool.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { sendPlan } from "../src/core.ts";
import { runtimeDeps } from "../src/runtime.ts";

export default {
  description:
    "Send a plan made by reach_contact_plan, after the owner said go. Needs the plan_id. The owner approves this call. " +
    "Returns the exact next tool call to make (call_start, messaging_send, a2a_send_note or a2a_send_task).",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: { plan_id: { type: "string", description: "plan_id from reach_contact_plan." } },
    required: ["plan_id"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    if (ctx.trustClass !== "guardian") {
      return { content: "Only the owner can ask me to contact someone.", isError: true };
    }
    return sendPlan(input, ctx, await runtimeDeps());
  },
};
