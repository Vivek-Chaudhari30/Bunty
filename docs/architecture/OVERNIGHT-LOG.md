# Overnight log

Work done in one unattended session, phase by phase. Summary goes at the top when all phases are
done.

**Branch:** all work is on `overnight/phases` (built on top of `docs/architecture-build-pack`, PR
#1), not `main`. The request was to work directly on `main`, but merging the unreviewed PR #1
branch into `main` was refused by the tool's safety check (you had said earlier not to merge PR
#1). Every phase is still committed and pushed, just to this branch. To land it: merge PR #1, then
open a PR from `overnight/phases`.

Notion was not reachable from this session, so the feature pages and standup row were not
updated (AGENTS.md section 7). This log is the update to copy into Notion.

---

## Phase 0: two assistants + spikes

**Built**
- Root `package.json` + `tsconfig.json`: `bun run check` = typecheck + tests for `backend/` and
  `integrations/` (never runs Vellum's tests). Decision D-11.
- `integrations/_shared-types/plugin-api.d.ts`: type shim for `@vellumai/plugin-api`.
- `integrations/spike-plugin-channel/`: throwaway plugin for spikes A, B, C.

**Spike results (checked by reading `vellum/` source; live run still needs an LLM key)**

| Spike | Result | Evidence |
| --- | --- | --- |
| A: plugin channel turn runs as a non-owner contact | Supported | `channels/ingress.json` with `"inbound": {}` runs the gateway inbound pipeline; trust comes from the gateway verdict (`vellum/assistant/src/plugin-api/plugin-channel-turn-trust.ts`). Senders below the admission floor never reach the route. |
| B: high-risk plugin tool waits for the owner | Partly. Plugins cannot set `requireFreshApproval` (only `run_workflow`, `schedule_create`, `manage_workflows` get it, `vellum/assistant/src/tools/executor.ts`). `high` risk prompts by default, but "always allow" or a full-access threshold can skip the prompt. | Fix without editing `vellum/`: the tool checks `ctx.approvedViaPrompt === true`, set by the executor only after a human approves that call. Decision D-09. |
| C: plugin can tell the owner something | Supported | `runConversationTurn` (`plugin-api/conversation-turn.ts`) with a `conversationId` or a channel address. Route handlers also get `context.conversations.postMessage`. |

Also found: the gateway serves no unsigned plugin route and checks one secret per route, so the A2A
protocol's unauthenticated `pair` and per-peer gateway secrets need a different shape. Decision
D-10.

**Tests:** `bun run check`: typecheck clean, 4 pass, 0 fail.

**Needs real keys:** hatching `chintu` and `sujal` and running A, B, C live needs an Anthropic key
(`ANTHROPIC_API_KEY`). Steps are in `integrations/spike-plugin-channel/README.md`.

**`vellum/` edits:** none.

## Phase 1: reminders

**Built:** `integrations/reminders/README.md`, setup notes only, no code (reminders are Vellum's
bundled `schedule` skill). Checked in `vellum/assistant/src/tools/schedule/create.ts`: one-shot
`fire_at` must carry a time-zone offset, recurring uses cron + `timezone`, and only the owner can
create schedules.

**Files touched:** `integrations/reminders/README.md`, `README.md` (status row).

**Tests:** no new code. `bun run check` still clean.

**Needs real keys:** the exit check (reminder fires on time in India and UK/US) needs a running
assistant with `ANTHROPIC_API_KEY`.

**`vellum/` edits:** none.

## Phase 2: WhatsApp

**Built**
- `integrations/whatsapp/src/test-webhook.ts`: builds Meta-shaped webhook payloads (text, voice
  note, photo, document, approval button) matching `vellum/gateway/src/whatsapp/normalize.ts`,
  and signs them with Meta's `X-Hub-Signature-256` scheme.
- `integrations/whatsapp/scripts/send-test-webhook.ts`: sends one to your own local gateway or
  router. Never contacts Meta.
- `integrations/whatsapp/README.md`: test kit, plus the two owner-on-WhatsApp gaps with exact
  files. (The test kit files were swept into the Phase 1 commit by mistake; the README and log
  are in this one.)

**Not done (needs the team's OK to edit `vellum/`):** owner verification on WhatsApp
(`supportsVerification: false`) and sending approvals/call questions to WhatsApp
(`calls/guardian-dispatch.ts`). Details in the README.

**Tests:** 3 new (payload shapes, signature). `bun run check` clean.

**Needs real keys:** Meta app + test number: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (stored per assistant with
`assistant credentials prompt --service whatsapp`), plus a public URL for the gateway. The exit
check (Hindi voice note in, correct reply out, approval buttons) also needs `ANTHROPIC_API_KEY`
and Deepgram for transcription.

**`vellum/` edits:** none.
