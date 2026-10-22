import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { ownerOnly, rememberOwnerConversation, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description:
    "Make a one-time link so another person's Bunty assistant can connect with me. Use when the owner says " +
    "'connect with <name>'s assistant'. The owner sends the link to that person themselves. Valid 7 days; a new link replaces the old one.",
  defaultRiskLevel: "medium" as const,
  input_schema: { type: "object", properties: {} },
  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx);
    if (denied) return denied;
    return run(async () => {
      const s = await getService();
      rememberOwnerConversation(s, ctx);
      const { link, expiresAt } = await s.createInvite();
      return `Pairing link (send it to the other person yourself, valid until ${new Date(expiresAt).toISOString()}):\n${link}`;
    });
  },
};
