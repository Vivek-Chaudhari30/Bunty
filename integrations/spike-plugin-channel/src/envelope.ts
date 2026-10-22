// Turns a test delivery into the inbound envelope the Vellum gateway expects
// from a plugin channel (vellum/skills/plugin-builder/references/channels.md).

export interface SpikeDelivery {
  text: string;
  from: string;
  chatId: string;
  messageId: string;
  fromName?: string;
}

export interface InboundEnvelope {
  message: { content: string; conversationExternalId: string; externalMessageId: string };
  actor: { actorExternalId: string; displayName?: string };
  source: { chatType: "dm" };
}

export function parseDelivery(body: unknown): SpikeDelivery | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  for (const key of ["text", "from", "chatId", "messageId"]) {
    if (typeof b[key] !== "string" || (b[key] as string).length === 0) return null;
  }
  return {
    text: b.text as string,
    from: b.from as string,
    chatId: b.chatId as string,
    messageId: b.messageId as string,
    fromName: typeof b.fromName === "string" ? b.fromName : undefined,
  };
}

export function toEnvelope(d: SpikeDelivery): InboundEnvelope {
  return {
    message: { content: d.text, conversationExternalId: d.chatId, externalMessageId: d.messageId },
    actor: { actorExternalId: d.from, displayName: d.fromName },
    source: { chatType: "dm" },
  };
}
