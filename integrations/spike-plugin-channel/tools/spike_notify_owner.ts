// Spike C: a plugin tool posts a message into an owner conversation by running a turn.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";

export default {
  description:
    "Phase 0 test only. Posts a note into a conversation. Use when the user says 'run the notify spike'.",
  defaultRiskLevel: "medium" as const,
  input_schema: {
    type: "object",
    properties: {
      conversation_id: { type: "string", description: "Conversation to post into. Defaults to this one." },
      text: { type: "string", description: "What to tell the owner." },
    },
    required: ["text"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const { runConversationTurn } = await import("@vellumai/plugin-api");
    const conversationId =
      typeof input.conversation_id === "string" ? input.conversation_id : ctx.conversationId;
    const result = await runConversationTurn({
      conversationId,
      content: [{ type: "text", text: `[spike] ${String(input.text ?? "")}` }],
    });
    return { content: `posted to ${result.conversationId}`, isError: false };
  },
};
