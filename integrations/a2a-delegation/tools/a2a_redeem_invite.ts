import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { freshApproval, ownerOnly, rememberOwnerConversation, run } from "../src/gate.ts";
import { getService } from "../src/runtime.ts";

export default {
  description:
    "Connect with another person's Bunty assistant using the pairing link they sent the owner. Only when the owner pastes the link and asks.",
  defaultRiskLevel: "high" as const,
  input_schema: {
    type: "object",
    properties: { link: { type: "string", description: "The full pairing link." } },
    required: ["link"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const denied = ownerOnly(ctx) ?? freshApproval(ctx, "connecting to another assistant");
    if (denied) return denied;
    return run(async () => {
      const s = await getService();
      rememberOwnerConversation(s, ctx);
      const peer = await s.redeemInvite(String(input.link ?? ""));
      return `Connected with ${peer.owner_name}'s assistant ${peer.display_name} (peer id "${peer.peer_id}").`;
    });
  },
};
