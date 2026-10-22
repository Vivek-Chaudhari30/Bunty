# Overnight log

## Summary

All nine roadmap phases (0 to 8) have their code, docs and tests. Everything runs against mocks;
nothing called a real service, phone or person. `bun run check` (typecheck + 133 tests) passes.
No file in `vellum/` was changed.

**Where it is:** on `main`. The work was built on the `overnight/phases` branch (on top of PR #1,
`docs/architecture-build-pack`), because the tool's safety check refused merging the unreviewed
PR #1 into `main` during the night. PR #1 has since been merged and `main` now matches
`overnight/phases`, so `main` is the branch to use.

### What works with mocks

| Piece | Where | Tested |
| --- | --- | --- |
| Shared-number router: WhatsApp + calls to the right assistant, 24 h stickiness for non-users, onboarding reply, signed internal API, delete, consent, rate limits, audit, metrics | `backend/router` | 42 tests + a local smoke run |
| Reach a contact: route choice, emergency refusal, read-back, one-time approved plan, router hint, audit | `integrations/reach-contact` | 26 tests |
| Assistant to assistant: pairing, notes, tasks with Gates A/B/C, question back, cancel, deadlines, files (inline and signed link), pause on bad signatures, delete my data, audit | `integrations/a2a-delegation` | 40 tests, Chintu and Sujal end to end in one process |
| WhatsApp test kit (signed fake webhooks) and voice-reply adapter | `integrations/whatsapp` | 11 tests |
| Call voice config and the Phase 4 exit-check scorer | `integrations/calls` | 6 tests |
| Caddyfile generator for the server | `backend/deploy` | 4 tests |
| Phase 0 spike plugin | `integrations/spike-plugin-channel` | 4 tests |

### Keys and accounts needed, and where they go

| Need | Names | Where it plugs in |
| --- | --- | --- |
| Anthropic (LLM) | `ANTHROPIC_API_KEY` | Every assistant (Vellum). Needed for every live exit check. |
| Meta WhatsApp app + test number | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Each assistant: `assistant credentials prompt --service whatsapp`. Router: `ROUTER_WHATSAPP_APP_SECRET` (same app secret), `ROUTER_WHATSAPP_VERIFY_TOKEN`; the token and phone number id for the real onboarding reply. |
| Twilio account + number | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Each assistant via the `twilio-setup` skill. Router: `ROUTER_TWILIO_AUTH_TOKEN`. |
| Deepgram (speech to text) | `DEEPGRAM_API_KEY` | Each assistant (Vellum). |
| ElevenLabs (voices) | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_HI/EN/GU` | Each assistant (Vellum); `integrations/calls/scripts/voice-config.ts`; the voice-reply adapter. |
| Our own random secrets | `ROUTER_INTERNAL_HMAC_KEY`, `ROUTER_METRICS_TOKEN` | Router `.env`; the HMAC key also in each assistant for router hints. |
| Settings | `ROUTER_PUBLIC_BASE_URL`, `BUNTY_ADAPTERS=real`, `BUNTY_ASSISTANT_ID`, `BUNTY_ROUTER_URL`, `BUNTY_ASSISTANT_NAME`, `BUNTY_OWNER_NAME` | Router `.env` and each assistant's environment. |
| Public URLs | DNS for `router.<domain>` and `*.<domain>` | `infra/README.md` "Server deploy". |

A2A pairing secrets are created by the plugin and stored in Vellum's credential store. Nobody types them.

### Needs a decision from the team

- Review the overnight work now on `main` (it landed without a teammate's review).
- Two `vellum/` edits for the owner on WhatsApp (verification, approvals to WhatsApp), and one to
  wire voice-note replies in: see `integrations/whatsapp/README.md`. None were made.
- Decisions D-09 to D-14 are "chosen overnight, revisit" (`decisions.md`), and D-08 (`.pptx`) has
  a recommendation but no library added.
- Notion was not reachable, so this log is the update to copy into the feature pages and standup.

### Start here (for a teammate picking this up)

1. `git checkout main && git pull --ff-only && bun install && bun run check`. Expect 133 pass.
2. Read `docs/architecture/decisions.md` D-09 to D-14: what changed from the plan and why.
3. Run the router locally: `backend/router/README.md` "How to run". Send fake WhatsApps with
   `integrations/whatsapp/scripts/send-test-webhook.ts`.
4. With an Anthropic key, do Phase 0 live first: hatch `chintu` and `sujal`, install
   `integrations/spike-plugin-channel`, and run spikes A, B, C (its README). The most important
   check is whether `ctx.approvedViaPrompt` is set when the owner approves a prompt (D-09); every
   gate relies on it.
5. Then follow the phases' "Needs real keys" notes below, in order, using your own test numbers only.

**Branch note:** the request was to work directly on `main`; the phases below were committed to
`overnight/phases` first (see the summary above) and are now on `main`.

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

## Phase 6: a2a-delegation part 1 (pairing + notes)

**Built:** `integrations/a2a-delegation/` plugin skeleton and the pairing + notes half.
- `channels/ingress.json`: `pair` (gateway bearer = open invite token), `message`, `status`,
  `cancel`, `unpair`, `file` (gateway HMAC over `timestamp.nonce.body`, 300 s freshness). D-10.
- `src/signing.ts`: per-peer HMAC, 300 s clock skew, 10-minute nonce cache, 25 MB body limit,
  30 requests/minute per peer.
- `src/service.ts`: invite (7 days, one open at a time, only the hash stored), redeem (https only),
  pair exchange (shared secret + both ingress secrets into the credential store, never SQLite),
  unpair on both sides, notes end to end, `message_id` idempotency for 24 h, 3 retries at 2/4/8 s,
  pause a peer after 5 failed checks in 10 minutes and tell the owner.
- `src/envelope.ts`: hand-written validation of `message/send` and `bunty.delegation/v1`; peer
  text is always quoted as information, never an instruction.
- Tools: `a2a_create_invite`, `a2a_redeem_invite`, `a2a_unpair`, `a2a_send_note` (Gate 0),
  `a2a_resume_peer`, `a2a_task_status`. Owner only; sending tools need a fresh approval.
- `skills/a2a-delegation/SKILL.md`. `reach-contact` already prefers A2A for paired contacts.

**Decisions taken:** D-13 (peer messages never run a model turn), D-14 (snake_case wire format,
protocol doc example updated).

**Tests:** 24 new, including Chintu and Sujal end to end in one process with a fake gateway:
pair via link, one-time and expiring invites, unpair, note delivered to Owner B, forged and
replayed requests rejected, peer paused after 5 failures, unreachable peer. `bun run check`:
91 pass, 0 fail.

**Needs real keys:** two running assistants with public URLs (`public-ingress` skill or Velay), the
plugin installed and its ingress approved in each, `BUNTY_ASSISTANT_ID` set. No paid keys beyond
`ANTHROPIC_API_KEY`. Owner B seeing the note on WhatsApp also needs Phase 2.

**`vellum/` edits:** none.

## Phase 7: a2a-delegation part 2 (tasks and gates)

**Built:** `src/delegation.ts`, `src/files.ts`, `src/state.ts`, tools, schedule.
- Requester: `a2a_send_task` (Gate 0), `a2a_answer_question`, `a2a_cancel_task`; status pushes
  update `delegations_outbound` and tell Owner A only on accepted, question, done, declined,
  failed, canceled (D-06); results saved under `received/<taskId>/`.
- Assignee: a task arrives as `input_required` (Gate A asked) and Owner B is told who, what,
  deliverables and deadline; `accept_delegation` (Gate A), `a2a_ask_requester`,
  `release_delegation_result` (Gate C), `a2a_report_failure`, cancel from the requester.
- Gate B is Vellum's normal gating of Sujal's own tools while Owner B's assistant does the work
  (no plugin code needed).
- Gate C in code: the approved files' hash is stored; any status push with files that do not
  match is refused. Only files inside the workspace can be released.
- Files over 5 MB go by a signed 24 h link (`GET file`, signed request + URL signature).
- `schedules/deadline-sweep` (every 15 minutes) runs `a2a_deadline_sweep`: Owner A is asked once
  what to do about an overdue task (reminder, call, wait, cancel).

**Decisions taken:** D-08 (no `.pptx` library tonight; recommendation recorded).

**Tests:** 14 new. The roadmap scenario end to end: three presentations by tomorrow with accept,
a question back and answer, Gate C release, files arriving intact; plus decline, release before
accept refused, Gate A twice refused, Gate C bypass refused, path escape refused, cancel, missed
deadline (once), failure, status for someone else's task refused, 5 MB+ file by signed link.
The tool-gate test now covers all 15 tools. `bun run check`: 105 pass, 0 fail.

**Needs real keys:** as Phase 6. The live exit check also needs Owner B's assistant to produce the
decks (an LLM key) and, for files to reach Owner A on WhatsApp, Phase 2.

**`vellum/` edits:** none.

## Phase 8: hardening

**Built**
- Router: `POST /internal/users/delete` ("delete my data": routing row, consent, sticky routes),
  `POST /internal/consent`, per-number rate limits (30 WhatsApps, 5 calls per minute; over the
  limit, messages are dropped without a Meta retry and calls hear a busy message, and a dropped
  sender is never forwarded inside someone else's batch), `audit` table (onboarding replies,
  deletions; last 4 digits only), `GET /metrics` (Prometheus counters, optional bearer token).
- `a2a-delegation`: `audit` table of every request sent to a peer (ids only),
  `a2a_delete_my_data` (disconnect every peer, forget secrets, wipe the database and files).
- `reach-contact`: `audit.jsonl` of approved sends (last 4 digits or peer id, no text),
  `reach_contact_delete_data`.
- `integrations/whatsapp/src/voice-reply.ts`: voice in, voice out (D-07), with text fallback;
  ElevenLabs and Meta audio adapters, mocked by default. Not wired into Vellum (see README).
- Server deploy: Caddy in `infra/docker-compose.yml` (profile `server`), Caddyfile generated
  from `infra/assistants.json` by `backend/deploy`, router port bound to localhost,
  "delete my data" runbook and monitoring notes in `infra/README.md`.

**Files touched:** `backend/router/src/{app,config,store,limits}.ts`, `backend/router/test/hardening.test.ts`,
`backend/deploy/**`, `integrations/a2a-delegation/src/{db,service,delegation}.ts`,
`integrations/a2a-delegation/tools/a2a_delete_my_data.ts`, `integrations/reach-contact/src/{audit,core,plan,runtime}.ts`,
`integrations/reach-contact/tools/reach_contact_delete_data.ts`, `integrations/whatsapp/src/voice-reply.ts`,
`infra/{docker-compose.yml,assistants.example.json,README.md}`, `.gitignore`, `.env.example`
(`ROUTER_METRICS_TOKEN`), `README.md`.

**Interrupted:** this phase was interrupted once while editing `backend/router/src/store.ts`. That
edit had not been written, so the tree was clean and green; the work was redone from there.

**Tests:** 28 new. `bun run check`: 133 pass, 0 fail.

**Not done:** CES for provider tokens (considered: Vellum already keeps provider keys in its
credential store; nothing to add tonight), Exotel and Sarvam (later, as their own integrations per
the roadmap), voice replies wired into Vellum (needs a `vellum/` edit).

**Needs real keys:** ElevenLabs + Meta for voice replies; a VM, DNS and every key above for the
server deploy exit check ("a new tester onboards in under 5 minutes").

**`vellum/` edits:** none.
