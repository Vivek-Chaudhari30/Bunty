// "Delete my data" for this plugin: disconnect every assistant and wipe what we stored.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description:
    "Owner asked to delete their data: disconnect from every other assistant, forget all pairing secrets, and delete all notes, " +
    "tasks and received files this plugin stored. Cannot be undone.",
  defaultRiskLevel: "high" as const,
  input_schema: { type: "object", properties: {} },
  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "deleting all assistant-to-assistant data");
    if (denied) return denied;
    return run(async () => {
      const n = await (await getService()).deleteAllData();
      return `Deleted. Disconnected from ${n} assistant(s); all notes, tasks and files from this feature are gone.`;
    });
  },
};
