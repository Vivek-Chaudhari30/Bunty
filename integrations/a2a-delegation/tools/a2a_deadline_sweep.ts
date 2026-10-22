// Run by schedules/deadline-sweep every 15 minutes. Only tells the owner; sends nothing.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description: "Check tasks we sent to other assistants and tell the owner about any past their deadline. Sends nothing to anyone else.",
  defaultRiskLevel: "low" as const,
  input_schema: { type: "object", properties: {} },
  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx);
    if (denied) return denied;
    return run(async () => {
      const n = await (await getService()).deadlineSweep();
      return n ? `Told the owner about ${n} overdue task(s).` : "Nothing overdue.";
    });
  },
};
