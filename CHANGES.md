# Changes

Everything built so far, oldest first. Every phase is built and tested **against mocks**: no real
call, message, person or paid service has been used. Current total: `bun run check` = typecheck
clean, **142 tests pass, 0 fail**. Nothing in `vellum/` has been changed.

Example names follow AGENTS.md: assistants **Chintu** (Owner A's) and **Sujal** (Owner B's),
numbers `+91 00000 00001` and `+91 00000 00002`.

More detail per phase: [docs/architecture/OVERNIGHT-LOG.md](docs/architecture/OVERNIGHT-LOG.md).

## Before the phases: architecture docs

Added the design that every phase follows, and the rules that make AI tools read it.

- [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md): what we build, the core
  rule (Vellum is the brain, we add plugins), system map, flows, safety rules, the shared-number
  trap.
- [docs/architecture/ROADMAP.md](docs/architecture/ROADMAP.md): phases 0 to 8 with exit checks.
- [docs/architecture/a2a-delegation-protocol.md](docs/architecture/a2a-delegation-protocol.md):
  pairing, signing, envelope, task states, gates, status pushes, failure handling.
- [docs/architecture/channels-phone-whatsapp.md](docs/architecture/channels-phone-whatsapp.md):
  calls, WhatsApp, router behaviour, owner recognition.
- [docs/architecture/decisions.md](docs/architecture/decisions.md): decision log.
- [docs/architecture/MASTER-PROMPT.md](docs/architecture/MASTER-PROMPT.md): the prompt to paste
  into Claude Code or Codex, one session per phase.
- Spec READMEs: `backend/router/`, `integrations/a2a-delegation/`, `integrations/reach-contact/`,
  `integrations/whatsapp/`, `integrations/calls/`, `infra/`.
- [AGENTS.md](AGENTS.md): `docs/` may now hold `docs/architecture/`; new sections 11
  (architecture docs and roadmap) and 12 (assistant-to-assistant rules).
- `README.md` status rows and `ROUTER_*` names in `.env.example`.

## Phase 0: tooling and spikes

- **Added:** root `package.json` + `tsconfig.json` (`bun run check` = typecheck + tests for
  `backend/` and `integrations/`, never Vellum's tests); `integrations/_shared-types/plugin-api.d.ts`
  (type shim for `@vellumai/plugin-api`); `integrations/spike-plugin-channel/` (throwaway plugin
  for the three spikes); `infra/ship-phase.sh` (commits and pushes only when the check passes).
- **Spike results, from Vellum's source** (live run needs an LLM key):
  - A, plugin channel turn runs as a non-owner contact: supported.
  - B, high-risk plugin tool waits for the owner: partly. Plugins cannot set
    `requireFreshApproval`, so our tools check `ctx.approvedViaPrompt` (D-09).
  - C, a plugin can tell the owner something: supported (`runConversationTurn`).
- **Tests:** 4.

## Phase 1: reminders

- **Added:** [integrations/reminders/README.md](integrations/reminders/README.md). Setup notes
  only; reminders are Vellum's built-in `schedule` skill. Times must carry a time-zone offset;
  only the owner can create schedules.
- **Tests:** none (no code).

## Phase 2: WhatsApp

- **Added:** `integrations/whatsapp/src/test-webhook.ts` and `scripts/send-test-webhook.ts`: fake
  WhatsApp webhooks (text, voice note, photo, document, approval button) signed exactly like Meta
  signs them, for testing your own gateway or router without a Meta account.
- **Documented, not built:** the two `vellum/` changes the owner needs on WhatsApp (see
  [Proposed `vellum/` changes](#proposed-vellum-changes-not-made)).
- **Tests:** 3.

## Phase 3: shared-number router

- **Added:** [backend/router/](backend/router/README.md), Bun + TypeScript, no runtime
  dependencies. One shared WhatsApp number and phone number reach each person's own assistant.
  - Checks Meta and Twilio signatures; forwards a webhook for one assistant byte-for-byte; splits
    and re-signs a webhook that covers several people.
  - Calls: `<Redirect>` to the caller's assistant; unknown callers hear a sign-up message.
  - Non-users who were contacted by an assistant reach it for 24 hours (`/outbound-hint`).
  - Unknown WhatsApp numbers get one sign-up reply a day.
  - Logs show the last 4 digits of numbers only; no message bodies stored.
  - `scripts/add-user.ts`, `Dockerfile`, `infra/docker-compose.yml`.
- **Tests:** 32, plus a local smoke run of the server.

## Phase 4: phone calls

- **Added:** `integrations/calls/src/voice-config.ts` + `scripts/voice-config.ts` (India voice
  config: multilingual speech to text, per-language voices, AI disclosure on; dry run by default)
  and `src/exit-check.ts` + `scripts/exit-check.ts` (scores the 10 test calls: at most 1 failure,
  average first reply under 2.5 s). Calls themselves are built into Vellum.
- **Tests:** 6.

## Phase 5: reach a contact

- **Added:** [integrations/reach-contact/](integrations/reach-contact/README.md) plugin.
  - `reach_contact_plan`: picks call, WhatsApp, or the person's assistant; refuses emergency and
    helpline numbers (Vellum's list plus India's 100, 101, 102, 108, 1091, 1098); returns a
    read-back for the owner.
  - `reach_contact`: sends only an approved plan (fresh owner approval, one-time use, 30-minute
    expiry, words cannot change after approval); tells the router about non-users.
  - `skills/reach-contact/SKILL.md`.
- **Tests:** 22.

## Phase 6: assistant to assistant, pairing and notes

- **Added:** [integrations/a2a-delegation/](integrations/a2a-delegation/README.md) plugin,
  first half.
  - Pairing by one-time link (7 days, one open at a time); secrets kept in Vellum's credential
    store, never in SQLite; unpair on both sides.
  - Two signatures on every request (gateway layer + per-peer), 5-minute clock skew, replay
    protection, 25 MB limit, 30 requests/minute, peer paused after 5 failed checks.
  - Notes delivered to the other owner; peer text always shown as information, never as an
    instruction. Retries at 2 s, 4 s, 8 s; same message id answered once.
  - Tools: `a2a_create_invite`, `a2a_redeem_invite`, `a2a_unpair`, `a2a_send_note`,
    `a2a_resume_peer`, `a2a_task_status`; `skills/a2a-delegation/SKILL.md`.
  - `test/harness.ts` runs Chintu and Sujal in one process with a fake gateway.
- **Tests:** 24.

## Phase 7: assistant to assistant, tasks and gates

- **Added:** `src/delegation.ts`, `src/files.ts`, `src/state.ts`, more tools, a schedule.
  - **Gate 0:** Owner A approves sending the task (`a2a_send_task`).
  - **Gate A:** Owner B accepts or declines (`accept_delegation`). Nothing starts before that.
  - **Gate B:** Vellum's normal approvals for the tools Sujal uses while working.
  - **Gate C:** Owner B approves exactly which files go back (`release_delegation_result`). The
    approved files' hash is stored, and any status push with different files is refused in code.
  - Questions back (`a2a_ask_requester`, `a2a_answer_question`), cancel, failure, status pushes
    (Owner A hears only accepted, question, done, declined, failed, canceled).
  - Files up to 5 MB inline, bigger ones by a signed 24-hour link. Only files inside the
    workspace can be released.
  - Deadline sweep: every 15 minutes, Owner A is asked once what to do about an overdue task
    (now a timer started by `hooks/init.ts`, no model turn; see "After the phases").
- **Tests:** 14, including the roadmap scenario end to end ("three presentations by tomorrow").

## Phase 8: hardening and server deploy

- **Added:**
  - Router: "delete my data" (`/internal/users/delete`), consent with time
    (`/internal/consent`), rate limits (30 WhatsApps and 5 calls per number per minute), audit
    table, `/metrics` (counters only, optional token).
  - Plugins: audit logs of every outward action (no message text); `a2a_delete_my_data` and
    `reach_contact_delete_data`.
  - `integrations/whatsapp/src/voice-reply.ts`: voice note in, voice note out, with text
    fallback; ElevenLabs and Meta adapters mocked by default. **Not wired into Vellum.**
  - `backend/deploy/` (Caddyfile generator), Caddy in `infra/docker-compose.yml` (profile
    `server`), `infra/assistants.example.json`, server deploy, monitoring and "delete my data"
    runbook in [infra/README.md](infra/README.md).
- **Not done:** Exotel and Sarvam (later, as their own integrations), voice replies wired in.
- **Tests:** 28.

## After the phases: quick fixes (BUN-8, BUN-14, BUN-18, BUN-19)

- **BUN-8:** every plugin and `_template` now declares `"@vellumai/plugin-api": "^0.12.6"`,
  matching our Vellum copy (was `^0.8.0`, which Vellum's loader will soon refuse).
- **BUN-14:** `.github/workflows/check.yml` runs `bun run check` on Bun 1.3.11 for every pull
  request and push to `main` (D-17).
- **BUN-18:** the A2A deadline sweep runs on a timer inside the assistant, started by
  `hooks/init.ts` and stopped by `hooks/shutdown.ts`, so no model turn runs every 15 minutes.
  `schedules/deadline-sweep` is removed (D-15).
- **BUN-19:** router rate limits and A2A nonces and rate limits are stored in SQLite and survive a
  restart; "delete my data" clears them (D-16).
- **Tests:** 9 new (timer, restart, delete my data). Type shim gains `PluginLogger`,
  `InitContext.logger` and `ShutdownContext`.

## Decisions

Full text: [docs/architecture/decisions.md](docs/architecture/decisions.md).

| ID | Decision | Status |
| --- | --- | --- |
| D-01 | One assistant per person | Proposed |
| D-02 | Owner confirms every outward action, with per-contact grants | Proposed |
| D-03 | Assistant-to-assistant as a plugin, not a `vellum/` edit | Proposed |
| D-04 | Bunty-to-Bunty pairing only, for now | Proposed |
| D-05 | Messages to another user go assistant to assistant | Proposed |
| D-06 | Owner hears about delegated work only at key moments | Proposed |
| D-07 | WhatsApp replies mirror the input (voice in, voice out) | Proposed |
| D-08 | `.pptx` output: no library added; recommendation `pptxgenjs` | Open |
| D-09 | Gates checked with `ctx.approvedViaPrompt` | Chosen overnight, revisit |
| D-10 | A2A ingress: gateway key + per-peer HMAC; `pair` uses a bearer invite token | Chosen overnight, revisit |
| D-11 | Root `package.json` for tests and typecheck, dev dependencies only | Chosen overnight, revisit |
| D-12 | Every outside service behind an adapter, mock by default | Chosen overnight, revisit |
| D-13 | Peer messages never run a model turn | Chosen overnight, revisit |
| D-14 | Wire format uses Vellum's real A2A field names (snake_case) | Chosen overnight, revisit |
| D-15 | Deadline sweep runs on a timer, not a schedule | Proposed (agreed with Vivek) |
| D-16 | Rate limits and A2A nonces stored in SQLite | Proposed (agreed with Vivek) |
| D-17 | CI on GitHub Actions | Proposed (agreed with Vivek) |
| D-18 | Model access through AICredits, GPT-6 Luna first | Proposed (Vivek) |

## Proposed `vellum/` changes (not made)

Each needs the team's OK (AGENTS.md section 5). Details:
[integrations/whatsapp/README.md](integrations/whatsapp/README.md).

1. **Owner verification on WhatsApp.** WhatsApp has `supportsVerification: false`
   (`vellum/assistant/src/channels/types.ts`, `vellum/gateway/src/verification/identity-match.ts`).
   Change: let the owner's verified phone number count as the owner on WhatsApp.
2. **Approvals and call questions on WhatsApp.** They go only to the desktop conversation today
   (`vellum/assistant/src/calls/guardian-dispatch.ts`). Change: also send them to the owner's
   WhatsApp.
3. **Voice-note replies.** Vellum's WhatsApp sender sends only image, video and document
   (`vellum/assistant/src/messaging/providers/whatsapp/send.ts`). Change: send audio, so
   `voice-reply.ts` can be wired in.

## What still needs real API keys

| To check live | Needs |
| --- | --- |
| Phase 0 spikes and every later live check | `ANTHROPIC_API_KEY`, two hatched assistants |
| Phase 1 reminders on time in two time zones | `ANTHROPIC_API_KEY` |
| Phase 2 WhatsApp (Hindi voice note in, reply out, approval buttons) | Meta app + test number (`WHATSAPP_*`), `DEEPGRAM_API_KEY`, a public URL |
| Phase 3 router with two teammates on one number | `ROUTER_WHATSAPP_*`, `ROUTER_TWILIO_AUTH_TOKEN`, public URL for the router |
| Phase 4 ten test calls | `TWILIO_*`, `DEEPGRAM_API_KEY`, `ELEVENLABS_*` |
| Phase 5 call / text from a WhatsApp voice note | Phases 2 and 4, plus `BUNTY_ROUTER_URL` and `ROUTER_INTERNAL_HMAC_KEY` in each assistant |
| Phases 6 and 7 between two teammates | Two assistants with public URLs, plugin ingress approved, `BUNTY_ASSISTANT_ID` |
| Phase 8 voice replies and server deploy | `ELEVENLABS_*` + Meta, a VM and DNS for `router.<domain>` and `*.<domain>` |

Where each key plugs in: [README.md](README.md#keys-still-empty).
