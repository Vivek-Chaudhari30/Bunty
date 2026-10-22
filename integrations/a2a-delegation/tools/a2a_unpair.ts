import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description: "Disconnect from another person's assistant. Both sides forget the pairing.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: { peer_id: { type: "string", description: "Peer id from a2a_task_status." } },
    required: ["peer_id"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "disconnecting");
    if (denied) return denied;
    return run(async () => {
      await (await getService()).unpair(String(input.peer_id ?? ""));
      return "Disconnected.";
    });
  },
};
