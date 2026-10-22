// Gate 0 for tasks: nothing leaves without the owner's yes for this exact task.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, rememberOwnerConversation, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";
import type { Deliverable } from "../src/types.ts";

export default {
  description:
    "Ask another person's paired assistant to get work done by its owner, e.g. 'ask Owner B to make three presentations by tomorrow'. " +
    "Their owner decides whether to take it. Read back who, what, deliverables and deadline first.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: {
      peer_id: { type: "string", description: "Peer id of their assistant." },
      description: { type: "string", description: "What the owner wants done, in their words." },
      deliverables: {
        type: "array",
        items: { type: "object", properties: { title: { type: "string" }, format: { type: "string" } }, required: ["title"] },
        description: "What should come back, e.g. [{title: 'Presentation 1', format: 'pptx'}].",
      },
      due_by: { type: "string", description: "Deadline with time zone, e.g. 2026-01-02T18:00:00+05:30." },
    },
    required: ["peer_id", "description"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "sending a task to another assistant");
    if (denied) return denied;
    const description = String(input.description ?? "").trim();
    if (!description) return { content: "error: description is required", isError: true };
    const deliverables = Array.isArray(input.deliverables)
      ? (input.deliverables as Deliverable[]).filter((d) => d && typeof d.title === "string").slice(0, 20)
      : [];
    return run(async () => {
      const s = await getService();
      rememberOwnerConversation(s, ctx);
      const task = await s.sendTask(String(input.peer_id ?? ""), description, deliverables, typeof input.due_by === "string" ? input.due_by : undefined);
      return `Sent. Task id ${task.id}. Their owner will be asked to take it; I'll tell you when they answer.`;
    });
  },
};
