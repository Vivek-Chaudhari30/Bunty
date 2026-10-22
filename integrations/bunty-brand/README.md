# bunty-brand

- **What it does:** a `pre-model-call` hook adds the Bunty brand rules to the end of the system
  prompt for user-facing model calls (chat, WhatsApp, phone calls, approvals): the name Bunty,
  never mention Vellum or internal tools, the agreed "who made you" answer, and plain-language
  confirmations. Background calls (memory, titles, compaction) are left alone.
- **Text:** `src/brand-rules.ts` (`BRAND_RULES`, `USER_FACING_CALL_SITES`).
- **Secrets it needs:** none.
- **Works with:** `infra/scripts/set-bunty-identity.ts`, which sets the name and personality in
  `IDENTITY.md` and `SOUL.md`. This plugin keeps the rules even if those files are edited later.
- **How to test:** `bun test integrations/bunty-brand`. Install with
  `cp -R integrations/bunty-brand "$VELLUM_WORKSPACE_DIR/plugins/bunty-brand"`, check
  `assistant plugins list` shows `ok` and `assistant plugins inspect bunty-brand` shows no drift,
  then ask "Who made you?" and "Are you Vellum?" in chat.
