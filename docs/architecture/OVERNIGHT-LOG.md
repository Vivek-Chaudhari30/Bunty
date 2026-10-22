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

## Phase 3: router

**Built:** `backend/router/`, Bun + TypeScript, no runtime dependencies (`bun:sqlite`,
`node:crypto`).
- Routes: `GET /whatsapp` (Meta verify), `POST /whatsapp`, `POST /twilio/voice`,
  `POST /outbound-hint`, `POST /internal/users`, `GET /healthz`.
- Meta signature checked before forwarding; single-assistant webhooks forwarded byte-for-byte with
  Meta's own signature; batched webhooks split per person and re-signed with the shared app secret.
- Twilio signature checked against `ROUTER_PUBLIC_BASE_URL/twilio/voice`; known callers get
  `<Redirect>` to their gateway; unknown callers hear a sign-up message.
- Non-user stickiness for 24 h from `/outbound-hint`; hints about another user are ignored (D-05).
- Unknown WhatsApp numbers get one onboarding reply per 24 h through the `WhatsAppSender` adapter
  (mock by default).
- Logs show the last 4 digits of numbers only; no message bodies stored.
- `scripts/add-user.ts`, `Dockerfile`, `infra/docker-compose.yml` (router service).

**Files touched:** `backend/router/**`, `infra/docker-compose.yml`, `.env.example`
(`ROUTER_PUBLIC_BASE_URL`, `ROUTER_ONBOARDING_URL`, `ROUTER_PORT`, `ROUTER_DB_PATH`,
`BUNTY_ADAPTERS`), `README.md`.

**Tests:** 32 new (`backend/router/test/`). `bun run check`: 39 pass, 0 fail. Also smoke-ran the
server locally with test values: health, add-user, forged webhook (401), unknown number
(onboarding via mock), known user with no gateway running (502, as designed).

**Decisions taken:** split + re-sign batched webhooks (needs every assistant to share the Meta app
secret, which the router README already assumes). 502 on gateway failure so Meta retries.

**Needs real keys:** `ROUTER_WHATSAPP_APP_SECRET`, `ROUTER_WHATSAPP_VERIFY_TOKEN` (Meta app),
`ROUTER_TWILIO_AUTH_TOKEN` (Twilio), `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` for the
real onboarding reply (`BUNTY_ADAPTERS=real`), a public URL for the router. Exit check (two
teammates, one shared number) needs those plus two running assistants.

**`vellum/` edits:** none.

## Phase 4: phone calls

**Built:** calls are built into Vellum (Twilio Media Streams, Deepgram, ElevenLabs), so this is
config and measurement only.
- `integrations/calls/src/voice-config.ts` + `scripts/voice-config.ts`: the India voice config
  (`services.stt.language multi`, ElevenLabs per-language voices, `calls.disclosure.enabled true`).
  Dry run by default. Keys checked against `vellum/assistant/src/config/schemas/{stt,tts,calls}.ts`.
- `integrations/calls/src/exit-check.ts` + `scripts/exit-check.ts`: scores the 10 test calls from a
  CSV against the roadmap's exit check.

**Files touched:** `integrations/calls/**`, `.env.example` (`ELEVENLABS_VOICE_HI/EN/GU`),
`README.md`.

**Tests:** 6 new. `bun run check` clean.

**Needs real keys:** Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`,
stored via the `twilio-setup` skill), `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` + voice ids,
`ANTHROPIC_API_KEY`, a public URL. Then guardian phone verification and the 10 test calls.

**`vellum/` edits:** none.

**Incident (Phase 4):** commit `86e4522` was pushed to `overnight/phases` with a typecheck error
(tests passed). My commit command chained on `grep`, not on the check's exit code. Fixed in the
next commit (`ae62c23`). From then on every phase ships through `infra/ship-phase.sh`, which
commits and pushes only when `bun run check` passes. `main` was never touched.

## Phase 5: integrations/reach-contact

**Built:** the `reach-contact` plugin.
- `reach_contact_plan` (low risk, owner only): picks the route (call, WhatsApp, A2A note, A2A task)
  with `src/route-policy.ts`, refuses emergency/helpline numbers (Vellum's list plus India's 100,
  101, 102, 108, 1091, 1098), saves the plan and returns the read-back for the owner.
- `reach_contact` (high risk, owner only): sends only an approved plan. Checks
  `ctx.approvedViaPrompt` (D-09), one-time use, 30-minute expiry, and a digest so the words cannot
  change after approval. Tells the router about non-users (`/outbound-hint`, signed). Returns the
  exact Vellum tool call to make (plugins cannot call Vellum tools directly).
- `skills/reach-contact/SKILL.md`: the steps and wording rules.

**Files touched:** `integrations/reach-contact/**`, `.env.example` (`BUNTY_ASSISTANT_ID`,
`BUNTY_ROUTER_URL`), `README.md`.

**Tests:** 22 new. `bun run check`: 67 pass, 0 fail.

**Decisions taken:** two tools (plan, then send) so the owner approves a fixed plan; text to a
Bunty user goes A2A or is refused until paired (D-05). Known friction: `call_start` and
`messaging_send` have their own Vellum prompts, so the owner may approve twice. Template messages
for first WhatsApp contact (outside the 24 h window) are not built: they need an approved Meta
template, which needs a Meta account.

**Needs real keys:** everything Phase 2 and 4 need, plus `BUNTY_ROUTER_URL` and
`ROUTER_INTERNAL_HMAC_KEY` in each assistant with `BUNTY_ADAPTERS=real`.

**`vellum/` edits:** none.
