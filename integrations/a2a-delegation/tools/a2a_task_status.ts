import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { ownerOnly, rememberOwnerConversation, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";
import { statusReport } from "../src/report.ts";

export default {
  description:
    "List connected assistants and notes/tasks in both directions with their state. Use for 'who am I connected to', " +
    "'what did Owner B's assistant say', or before choosing a peer_id.",
  defaultRiskLevel: "low" as const,
  input_schema: {
    type: "object",
    properties: { task_id: { type: "string", description: "Optional: show one task." } },
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx);
    if (denied) return denied;
    return run(async () => {
      const s = await getService();
      rememberOwnerConversation(s, ctx);
      return statusReport(s.deps.db, typeof input.task_id === "string" ? input.task_id : undefined);
    });
  },
};
