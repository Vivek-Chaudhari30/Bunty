// Telling the owner something: a note arrived, a task needs their OK, a result came
// back. Inside an assistant this runs a turn in the owner's conversation (Phase 0 Spike C),
// so the owner hears it on whatever channel they use.

export interface OwnerNotifier {
  notify(text: string): Promise<void>;
}

export class MemoryNotifier implements OwnerNotifier {
  readonly messages: string[] = [];
  async notify(text: string) {
    this.messages.push(text);
  }
  last(): string {
    return this.messages.at(-1) ?? "";
  }
}

/**
 * Posts into the owner's conversation with runConversationTurn. The conversation id is
 * remembered whenever the owner uses one of this plugin's tools.
 */
export class VellumOwnerNotifier implements OwnerNotifier {
  constructor(private readonly ownerConversationId: () => string | null) {}
  async notify(text: string) {
    const { runConversationTurn } = await import("@vellumai/plugin-api");
    const conversationId = this.ownerConversationId() ?? undefined;
    await runConversationTurn({
      conversationId,
      content: [{ type: "text", text: `[a2a-delegation update for the owner]\n${text}` }],
    });
  }
}
