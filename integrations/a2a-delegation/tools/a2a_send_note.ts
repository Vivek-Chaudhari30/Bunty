// Gate 0 for notes: nothing leaves without the owner's yes for this exact text.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, rememberOwnerConversation, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description:
    "Send a short note to another person through their paired assistant (for example 'tell Owner B I'll be there at 6'). " +
    "Their assistant shows it to them. Use the owner's exact words.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: {
      peer_id: { type: "string", description: "Peer id of their assistant." },
      text: { type: "string", description: "The note, in the owner's words." },
    },
    required: ["peer_id", "text"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "sending a note to another assistant");
    if (denied) return denied;
    const text = String(input.text ?? "").trim();
    if (!text) return { content: "error: text is required", isError: true };
    return run(async () => {
      const s = await getService();
      rememberOwnerConversation(s, ctx);
      const task = await s.sendNote(String(input.peer_id ?? ""), text);
      return `Delivered (${task.status.state}). Reference: ${task.id}`;
    });
  },
};
