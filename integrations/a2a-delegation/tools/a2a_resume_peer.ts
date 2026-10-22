import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description: "Resume a paired assistant that I paused after failed security checks. Only if the owner says it was expected.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: { peer_id: { type: "string" } },
    required: ["peer_id"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "resuming a paused connection");
    if (denied) return denied;
    return run(async () => {
      (await getService()).resumePeer(String(input.peer_id ?? ""));
      return "Resumed.";
    });
  },
};
