# Status audit

Date: 2026-10-22. Commit audited: `12a87ad` on `main`. Scope: everything in `backend/`,
`integrations/`, `infra/`, the tests, `.env.example`, the docs in `docs/architecture/`, and how our
code hooks into `vellum/`. No application code was changed for this audit.

Linear: project [Bunty v1 launch](https://linear.app/buntysi/project/bunty-v1-launch-b6307925bd16) (team Bunty), one milestone per roadmap phase. Each task below links its Linear issue; dependencies are set as "blocked by" links in Linear. Tasks that need the owner carry the `needs-owner` label.

## Summary

**Overall: 29% complete.**

Almost all of our own code is written and unit tested, but **nothing has run against a real
service or inside a real Vellum assistant yet**. No LLM key, no WhatsApp or Twilio account, no
public URL, no server. The next 70% is mostly getting accounts and keys, running live checks,
fixing what they find, and three small `vellum/` changes that need a team decision.

## How it is scored

Each area gets up to 100 points in three parts:

| Part | Points | What earns them |
| --- | --- | --- |
| Code written and unit tested | 40 | Our code exists, typechecks, has tests against mocks |
| Works against real services | 35 | Verified with the real Vellum assistant, Meta, Twilio, Deepgram, ElevenLabs, Anthropic or a real peer assistant |
| Tested end to end, live | 25 | The roadmap's exit check passed with real phones, real WhatsApp, two real assistants |

Today no area has any points in the second or third part, except a small credit where code ran
end to end locally (the router smoke run, the in-process Chintu and Sujal harness). The overall
figure is the plain average of the 11 areas.

| Area | Code (40) | Real services (35) | End to end (25) | Total | Why |
| --- | --- | --- | --- | --- | --- |
| WhatsApp | 25 | 0 | 0 | **25%** | Built into Vellum; our test kit and voice adapter exist. Owner verification and approvals on WhatsApp need `vellum/` changes. No Meta account. |
| Phone calls | 30 | 0 | 0 | **30%** | Built into Vellum; India voice config and exit-check scorer written. No Twilio, Deepgram or ElevenLabs keys. |
| Router | 38 | 0 | 3 | **41%** | Full service with 42 tests and a local smoke run. Never behind a public URL with real Meta or Twilio traffic. |
| reach_contact | 32 | 0 | 0 | **32%** | Plan, approve, send, emergency refusal, router hint. The hand-off to `call_start` / `messaging_send` is unverified; WhatsApp first-contact templates not built. |
| A2A delegation | 36 | 0 | 5 | **41%** | Pairing, notes, tasks, Gates A/B/C, files, deadlines; Chintu and Sujal run end to end in one process. Never between two real assistants or through the real gateway. |
| Approvals | 25 | 0 | 0 | **25%** | Every gated tool checks `ctx.approvedViaPrompt` (D-09), unverified on a live assistant. Approvals reach only the desktop app until the `vellum/` changes land. |
| Voice (STT/TTS, voice notes, Indian languages) | 18 | 0 | 0 | **18%** | Config and voice-reply adapter only. Not wired in (needs a `vellum/` change); Hindi, Hinglish and Gujarati quality untested; Sarvam fallback undecided. |
| Memory / Vellum integration | 20 | 0 | 0 | **20%** | Our plugins have never been loaded by a real assistant. They declare plugin API `^0.8.0` while Vellum is 0.12.6. Our types come from a shim. Memory itself is Vellum's and unused by us so far. |
| Safety | 32 | 0 | 3 | **35%** | Gates, signatures, replay protection, emergency refusal, audit logs, delete my data, consent endpoint, rate limits. Consent is not captured anywhere yet; deleting a person's Vellum memory is manual. |
| Deploy | 22 | 0 | 0 | **22%** | Dockerfile, Compose with Caddy, Caddyfile generator, runbook. Never deployed; no backups, alerting or CI. |
| Testing | 30 | 0 | 0 | **30%** | 133 unit and in-process tests, all passing. No CI, no live end-to-end tests, runtime adapters (credential store, notifier, HTTP transport) never executed. |

## Test run (this audit)

`bun run check` on Bun 1.2.10: typecheck clean, **133 pass, 0 fail, 0 skipped**, 397 expect()
calls, 12 test files. No TODO, FIXME or skipped tests in our code. No file in `vellum/` changed
since it was copied in (commit `066998a`).

## What the code audit found

- **Mocks with no live run yet:** `MockWhatsAppSender` (router onboarding reply),
  `MockRouterHintClient` (reach-contact), `MockTts` and `MockWhatsAppMessenger` (voice replies).
  Each has a real adapter that throws `NotConfiguredError` without its key
  (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `BUNTY_ROUTER_URL`,
  `ROUTER_INTERNAL_HMAC_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_*`). The router also
  refuses to start without its five `ROUTER_*` settings.
- **Runtime code never executed:** `integrations/*/src/runtime.ts`, `VellumSecretStore`,
  `VellumOwnerNotifier`, `FetchTransport`, all plugin route files. They only run inside a real
  assistant.
- **Plugin version range is stale:** every plugin (and `_template`) declares
  `"@vellumai/plugin-api": "^0.8.0"`; the assistant is 0.12.6. Vellum logs an error and loads
  anyway today, and its loader says this will become a hard failure
  (`vellum/assistant/src/plugins/external-plugin-loader.ts`).
- **Hand-off to Vellum tools is unverified:** `reach_contact` returns the exact `call_start` /
  `messaging_send` call for the model to make. The WhatsApp `conversation_id` format and the
  required `confidence` field are not confirmed, and the owner may see two approval prompts.
- **In-memory state:** router rate limits, A2A nonce cache and A2A rate limits reset on restart.
- **Cost:** `schedules/deadline-sweep` runs a model turn every 15 minutes per assistant.
- **No CI:** there is no `.github/` folder, so nothing runs `bun run check` on pull requests.
- **The 3 proposed `vellum/` changes** (none made): owner verification on WhatsApp, approvals
  and call questions to WhatsApp, audio sending for voice-note replies.
- **Decisions D-09 to D-14** are all "chosen overnight, revisit". D-08 (`.pptx`) is open.
- **Process:** the overnight work reached `main` without a teammate's review; the shared Notion
  key is invalid, so Notion updates (AGENTS.md section 7) are blocked.

## Top 5 bottlenecks (ranked by how much they block)

1. **No Anthropic key and no running assistants.** Blocks every live check in every phase,
   including loading our plugins at all. (A01 / BUN-7, A02 / BUN-21)
2. **Phase 0 spikes not run live.** Every gate (Gate 0, A, C, reach_contact) depends on
   `ctx.approvedViaPrompt` being set when the owner approves. If it is not, D-09 and the safety
   design need rework before anything else is worth testing. (A05 / BUN-30)
3. **No Meta WhatsApp or Twilio accounts, and no public URLs.** Blocks Phases 2 to 5 and the
   router going live. Meta business verification can take days, so it should start first.
   (A07 / BUN-9, A16 / BUN-12, A08 / BUN-24)
4. **Team decision on the 3 `vellum/` changes.** Without them, owners cannot approve anything on
   WhatsApp, which is the main channel, and voice-note replies cannot ship. (A09 / BUN-10)
5. **No server, domain or CI.** Blocks onboarding real testers, the Phase 8 exit check, and safe
   merging. (A30 / BUN-13, A31 / BUN-29, A35 / BUN-14)

## Pending tasks

Priority: Urgent, High, Medium, Low. Size: S (under a day), M (1 to 3 days), L (a week or more).
**Owner?** = needs you (keys, accounts, decisions); **Code now** = can be done today without
anything from you. Linear estimates use S=1, M=3, L=5.

### Phase 0: live assistants and spikes

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Get an Anthropic API key | Urgent | S | none | Owner || [BUN-7](https://linear.app/buntysi/issue/BUN-7) |
| A02 | Hatch Chintu and Sujal locally | Urgent | S | A01 | Code after A01 || [BUN-21](https://linear.app/buntysi/issue/BUN-21) |
| A03 | Fix plugin API version range (`^0.8.0` -> `^0.12.6`) in all plugins and `_template` | High | S | none | Code now || [BUN-8](https://linear.app/buntysi/issue/BUN-8) |
| A04 | Load our plugins in a live assistant; confirm no drift; check the type shim | High | M | A02, A03 | Code after A02 || [BUN-22](https://linear.app/buntysi/issue/BUN-22) |
| A05 | Run Phase 0 spikes A, B, C live (especially `ctx.approvedViaPrompt`) | Urgent | M | A04 | Code after A04 || [BUN-30](https://linear.app/buntysi/issue/BUN-30) |

### Phase 1: reminders

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A06 | Reminders exit check live in India and UK/US time zones | Medium | S | A02 | Code after A02 || [BUN-23](https://linear.app/buntysi/issue/BUN-23) |

### Phase 2: WhatsApp

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A07 | Meta developer app, WhatsApp test number, store the 4 credentials | Urgent | M | none | Owner || [BUN-9](https://linear.app/buntysi/issue/BUN-9) |
| A08 | Public URLs for local gateways (`public-ingress` skill or Velay) | High | S | A02 | Code after A02 || [BUN-24](https://linear.app/buntysi/issue/BUN-24) |
| A09 | Decide on the 3 proposed `vellum/` changes | High | S | none | Owner (decision) || [BUN-10](https://linear.app/buntysi/issue/BUN-10) |
| A10 | `vellum/` change: owner verification on WhatsApp | High | M | A09 | Code after A09 || [BUN-25](https://linear.app/buntysi/issue/BUN-25) |
| A11 | `vellum/` change: approvals and call questions to WhatsApp | High | M | A09 | Code after A09 || [BUN-26](https://linear.app/buntysi/issue/BUN-26) |
| A12 | WhatsApp exit check: text, Hindi voice note, photo, PDF, approval buttons | High | M | A07, A08, A10, A11, A16 | Code after keys || [BUN-33](https://linear.app/buntysi/issue/BUN-33) |

### Phase 3: router and onboarding

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A13 | Website onboarding writes router users and consent (signed `/internal/users`, `/internal/consent`) | High | M | A14 | Code now (wiring), verification after A14 || [BUN-28](https://linear.app/buntysi/issue/BUN-28) |
| A14 | Decide the OTP provider for onboarding | Medium | S | none | Owner (decision) || [BUN-11](https://linear.app/buntysi/issue/BUN-11) |
| A15 | Router live: one Meta webhook and one Twilio number, two teammates reach their own assistants | High | M | A07, A08, A16 | Code after keys || [BUN-32](https://linear.app/buntysi/issue/BUN-32) |

### Phase 4: phone calls

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A16 | Twilio account and number, Deepgram and ElevenLabs keys | Urgent | M | none | Owner || [BUN-12](https://linear.app/buntysi/issue/BUN-12) |
| A17 | Apply the India voice config; pick Hindi, English, Gujarati voices | High | S | A02, A16 | Code after keys || [BUN-27](https://linear.app/buntysi/issue/BUN-27) |
| A18 | Owner phone verification (guardian) on each assistant | High | S | A08, A16 | Code after keys || [BUN-31](https://linear.app/buntysi/issue/BUN-31) |
| A19 | Phase 4 exit check: 10 calls, latency, Hindi / Hinglish / Gujarati quality | High | M | A17, A18 | Code after keys || [BUN-42](https://linear.app/buntysi/issue/BUN-42) |
| A20 | Decide on a Sarvam AI fallback for Indian-language STT/TTS | Medium | S | A19 | Owner (decision) || [BUN-46](https://linear.app/buntysi/issue/BUN-46) |

### Phase 5: reach_contact

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A21 | reach_contact live: verify the `call_start` / `messaging_send` hand-off and the double prompt | High | M | A05, A12, A19 | Code after keys || [BUN-47](https://linear.app/buntysi/issue/BUN-47) |
| A22 | WhatsApp template message for first contact outside the 24 h window | Medium | M | A07 | Owner (template approval) || [BUN-41](https://linear.app/buntysi/issue/BUN-41) |

### Phases 6 and 7: assistant to assistant

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A23 | A2A live: pairing and notes between two real assistants through the real gateway | High | M | A05, A08 | Code after A05 || [BUN-43](https://linear.app/buntysi/issue/BUN-43) |
| A24 | A2A live: the "three presentations by tomorrow" scenario with Gates A and C, files, cancel, deadline | High | L | A23 | Code after A23 || [BUN-48](https://linear.app/buntysi/issue/BUN-48) |
| A25 | Cut the deadline-sweep cost (a model turn every 15 minutes) | Medium | S | none | Code now || [BUN-18](https://linear.app/buntysi/issue/BUN-18) |
| A26 | Persist rate limits and the A2A nonce cache across restarts | Low | S | none | Code now || [BUN-19](https://linear.app/buntysi/issue/BUN-19) |
| A27 | Decide the `.pptx` library (D-08) | Low | S | none | Owner (decision) || [BUN-20](https://linear.app/buntysi/issue/BUN-20) |

### Phase 8: hardening and deploy

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A28 | Voice-note replies: `vellum/` audio send, OGG/Opus output, wire the adapter | Medium | M | A09, A12 | Code after A09 || [BUN-44](https://linear.app/buntysi/issue/BUN-44) |
| A29 | Delete my data end to end, including the Vellum workspace and memory | Medium | M | A04 | Code after A04 || [BUN-34](https://linear.app/buntysi/issue/BUN-34) |
| A30 | Hosting: VM, domain, DNS | High | M | none | Owner || [BUN-13](https://linear.app/buntysi/issue/BUN-13) |
| A31 | Deploy router, Caddy and assistants on the VM | High | M | A30, A07, A16 | Code after A30 || [BUN-29](https://linear.app/buntysi/issue/BUN-29) |
| A32 | Automate per-tester assistant provisioning (hatch, env, router row, Caddy) | Medium | M | A31 | Code after A31 || [BUN-35](https://linear.app/buntysi/issue/BUN-35) |
| A33 | Nightly backups of assistant workspaces | Medium | S | A31 | Code after A31 || [BUN-36](https://linear.app/buntysi/issue/BUN-36) |
| A34 | Monitoring and alerting (metrics, alerts, log retention) | Medium | M | A31 | Code after A31 || [BUN-37](https://linear.app/buntysi/issue/BUN-37) |
| A35 | CI: run `bun run check` on every pull request with Bun 1.3.11 | High | S | none | Code now || [BUN-14](https://linear.app/buntysi/issue/BUN-14) |
| A36 | Security review: server secrets, CES, key rotation, dependency pinning | Medium | M | A31 | Owner (rotations) || [BUN-38](https://linear.app/buntysi/issue/BUN-38) |
| A37 | Phase 8 exit check: a new tester onboards in under 5 minutes on the server | Medium | M | A31, A32, A13 | Code after A31 || [BUN-45](https://linear.app/buntysi/issue/BUN-45) |

### Team decisions and review

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A38 | Review decisions D-09 to D-14 ("revisit") with the team | High | S | A05, A23 | Owner (decision) || [BUN-49](https://linear.app/buntysi/issue/BUN-49) |
| A39 | Teammate review of the overnight code that reached `main` unreviewed | High | M | none | Owner || [BUN-15](https://linear.app/buntysi/issue/BUN-15) |
| A40 | Fix Notion access (shared key invalid; join the BUNTY workspace) | Medium | S | none | Owner || [BUN-16](https://linear.app/buntysi/issue/BUN-16) |
| A41 | Confirm the `backend/` and `infra/` folders with the team (AGENTS.md section 3) | Low | S | none | Owner (decision) || [BUN-17](https://linear.app/buntysi/issue/BUN-17) |

### Later integrations (agreed order, after launch basics)

| ID | Task | Priority | Size | Depends on | Owner? | Linear |
| --- | --- | --- | --- | --- | --- | --- |
| A42 | Google (Gmail, Calendar) via Composio | Low | L | A04 | Owner (key) || [BUN-39](https://linear.app/buntysi/issue/BUN-39) |
| A43 | Zomato and Swiggy via their MCP servers | Low | L | A04 | Owner (accounts) || [BUN-40](https://linear.app/buntysi/issue/BUN-40) |
| A44 | Exotel for Indian phone numbers | Low | M | A19 | Owner (account) || [BUN-50](https://linear.app/buntysi/issue/BUN-50) |

**Totals:** 44 tasks: 5 Urgent, 20 High, 13 Medium, 6 Low. 17 need you; 5 can be coded right
now (A03, A13 wiring, A25, A26, A35).

Already in Linear and not duplicated: BUN-5 (website, which A13 and A37 relate to) and BUN-6
(competitor research).
