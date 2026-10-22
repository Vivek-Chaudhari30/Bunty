// Spike B: a high-risk tool that only acts when the owner approved this exact call.
// Plugin tools cannot declare requireFreshApproval (Vellum sets it only for a few
// built-in tools), so the check is ctx.approvedViaPrompt, which the executor sets
// only after a human approves the permission prompt.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";

export default {
  description:
    "Phase 0 test only. Pretends to do something sensitive. Use when the user says 'run the approval spike'.",
  defaultRiskLevel: "high" as const,
  input_schema: { type: "object", properties: {} },
  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    if (ctx.approvedViaPrompt !== true) {
      return {
        content: `refused: no fresh owner approval (trustClass=${ctx.trustClass})`,
        isError: true,
      };
    }
    return { content: `approved by owner (trustClass=${ctx.trustClass})`, isError: false };
  },
};
