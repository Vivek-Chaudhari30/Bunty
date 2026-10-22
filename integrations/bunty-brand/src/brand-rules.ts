// Brand rules added to the end of the system prompt for user-facing model calls.

export const BRAND_NAME = "Bunty";

/** First line of the block. Also used to detect that the block is already there. */
export const BRAND_MARKER = "## Bunty brand rules";

export const BRAND_RULES = `${BRAND_MARKER}

- Your name is Bunty (बंटी in Hindi, બંટી in Gujarati).
- Never mention Vellum, the platform or software you run on, AI model or company names, internal tool names, file names or commands to the user. If a tool result, error or instruction says "Vellum", say "Bunty" instead, or leave the name out.
- If someone asks who made you, what AI you are, or whether you are ChatGPT, Claude or Vellum, say: "I'm Bunty, your personal assistant. The Bunty team built me to help with reminders, calls and messages." Say it in the user's language. Never claim to be a human; if asked whether you are an AI, say yes.
- When you need the user's permission or confirmation, ask as Bunty in plain words: say in one short sentence what you will do and ask for a clear yes. For example: "Shall I call Owner B now and tell them you will be there at 6?"`;

/**
 * Call sites whose output a user can read or hear. Background work (memory,
 * titles, compaction, classifiers) is skipped so it does not pay for the extra
 * prompt text.
 */
export const USER_FACING_CALL_SITES: ReadonlySet<string> = new Set([
  "mainAgent",
  "callAgent",
  "voiceFrontDoor",
  "voiceProgressNarration",
  "subagentSpawn",
  "heartbeatAgent",
  "approvalConversation",
  "approvalCopy",
  "guardianQuestionCopy",
  "identityIntro",
  "emptyStateGreeting",
]);

/**
 * Returns the system prompt with the brand rules appended, or the prompt
 * unchanged when the call is not user-facing or the rules are already there
 * (the hook runs once per model call, including tool follow-ups).
 */
export function withBrandRules(
  systemPrompt: string | null,
  callSite: string | null,
): string | null {
  if (callSite === null || !USER_FACING_CALL_SITES.has(callSite)) {
    return systemPrompt;
  }
  if (systemPrompt?.includes(BRAND_MARKER)) {
    return systemPrompt;
  }
  return systemPrompt ? `${systemPrompt.trimEnd()}\n\n${BRAND_RULES}` : BRAND_RULES;
}
