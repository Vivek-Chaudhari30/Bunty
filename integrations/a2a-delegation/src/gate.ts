// Who may call a tool, checked in code (decisions D-02 and D-09).
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { OWNER_CONVERSATION_KEY } from "./runtime.ts";
import type { DelegationService } from "./delegation.ts";
import { A2AError } from "./service.ts";

/** Only the owner (guardian). Peers and contacts never reach these tools' effects. */
export function ownerOnly(ctx: ToolContext): ToolExecutionResult | null {
  if (ctx.trustClass !== "guardian") {
    return { content: "Only my owner can do this.", isError: true };
  }
  return null;
}

/** The owner approved this exact call in the permission prompt (not a saved "always allow"). */
export function freshApproval(ctx: ToolContext, what: string): ToolExecutionResult | null {
  if (ctx.approvedViaPrompt !== true) {
    return {
      content: `Not done: ${what} needs the owner's approval in the prompt for this exact call. If "always allow" is on for this tool, turn it off.`,
      isError: true,
    };
  }
  return null;
}

/** Remembers where to tell the owner about later updates. */
export function rememberOwnerConversation(service: DelegationService, ctx: ToolContext): void {
  if (ctx.trustClass === "guardian" && ctx.conversationId) {
    service.deps.db.setSetting(OWNER_CONVERSATION_KEY, ctx.conversationId);
  }
}

export async function run(fn: () => Promise<string>): Promise<ToolExecutionResult> {
  try {
    return { content: await fn(), isError: false };
  } catch (err) {
    if (err instanceof A2AError) return { content: err.message, isError: true };
    return { content: `Something went wrong: ${String(err)}`, isError: true };
  }
}
