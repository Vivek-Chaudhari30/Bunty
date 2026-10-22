// Gate C: results leave only with the owner's approval of exactly these files.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description:
    "Send finished files for a task back to the assistant that asked, after the owner looked at the list and said send. " +
    "Paths are inside the workspace. Exactly these files are sent; anything else is refused.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      files: { type: "array", items: { type: "string" }, description: "Workspace paths of the files to send." },
      note: { type: "string", description: "Short covering note, in the owner's words." },
    },
    required: ["task_id", "files"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "sending results to another assistant");
    if (denied) return denied;
    const files = Array.isArray(input.files) ? input.files.filter((f): f is string => typeof f === "string") : [];
    return run(async () => {
      const r = await (await getService()).releaseResult(String(input.task_id ?? ""), files, String(input.note ?? ""));
      return `Sent ${r.files} file(s).`;
    });
  },
};
