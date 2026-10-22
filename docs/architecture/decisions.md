# Decisions

Format: `ID · date · status` (Proposed / Agreed / Replaced). Never delete a decision; mark old ones
Replaced. Copy agreed ones to the Notion Overview page.

## D-01 · One assistant per person · Proposed
Each person gets their own Vellum assistant (own memory, owner, credentials). Shared numbers reach
it through `backend/router`. Why: matches Vellum's one-owner design and AGENTS.md. Instead of: one
multi-user assistant. Trade-off: more containers per server.

## D-02 · Owner confirms every outward action, with per-contact grants · Proposed
Calls, messages and A2A sends to someone else need the owner's yes, checked in code. The owner can
say "always allow for Owner B" (Vellum scoped grants). Gate C (sending results back) is always
asked. Trade-off: one extra tap for new contacts.

## D-03 · A2A as a plugin, not a `vellum/` edit · Proposed
`integrations/a2a-delegation` uses a plugin channel, plugin tools and HMAC-signed HTTPS, with A2A v1
JSON shapes. Why: AGENTS.md says plugins first; survives Vellum updates. Instead of: adding
`addressFor` to `vellum/assistant/src/messaging/providers/a2a/transport.ts` and a gateway route.
Trade-off: we maintain our own pairing and signing. Revisit if Phase 0 Spike B fails.

## D-04 · Bunty-to-Bunty A2A only, for now · Proposed
Peers must be paired by invite link. No open A2A interfaces in an agent card. Why: simpler trust
model. Trade-off: cannot talk to non-Vellum agents yet.

## D-05 · Messages to another user go assistant to assistant · Proposed
Because of the shared WhatsApp number (ARCHITECTURE.md section 9). Messages to non-users use
WhatsApp/calls with router stickiness.

## D-06 · Owner hears about delegated work only at key moments · Proposed
Push to the owner on: accepted, question, done, declined, failed, canceled. Everything else stays
on the task. Trade-off: less noise, less live detail.

## D-07 · WhatsApp replies mirror the input · Proposed (Phase 8)
Voice note in, voice note out; text in, text out. Per-user setting to turn voice replies off.

## D-08 · `.pptx` output · Open
Sujal needs to produce PowerPoint files. Options: a skill using a Node library in the sandbox, or
HTML decks from `app-builder` exported later. Ask before adding a dependency.

## D-09 · Gates checked with `ctx.approvedViaPrompt` · Proposed (chosen overnight, revisit)
Phase 0 Spike B, checked in `vellum/` source: a plugin tool cannot declare `requireFreshApproval`.
Vellum sets that flag only for a few built-in tools (`vellum/assistant/src/tools/executor.ts`).
A `high` risk tool still prompts by default, but an "always allow" rule or a full-access threshold
can skip the prompt. So every gated tool (Gate 0, A, C, reach_contact) also checks
`ctx.approvedViaPrompt === true` in `execute`, which the executor sets only after a human approved
that exact call. Trade-off: if the owner turned on "always allow", the tool refuses and says why.
Revisit on a live assistant: confirm `approvedViaPrompt` is set when the owner approves a prompt
that a non-owner (peer) turn raised.

## D-10 · A2A ingress: gateway key + per-peer HMAC · Proposed (chosen overnight, revisit)
The gateway refuses unsigned plugin routes and checks one secret per route
(`vellum/skills/plugin-builder/references/channels.md`), so the protocol's "unauthenticated
`pair`" and "per-peer secret checked by the gateway" do not fit as written. Chosen:
- `pair` uses gateway `bearer` verification with the current invite token as the bearer secret
  (one open invite at a time; the plugin also checks the token hash, expiry and one-time use).
- Other routes use gateway `hmac` with one assistant-wide `ingress_hmac_secret`, handed to each
  peer at pairing, over `timestamp.nonce.body`. The plugin then checks the per-peer
  `X-Bunty-Signature` as the protocol says. Two layers: the gateway proves "a paired peer", the
  plugin proves "which peer".
Instead of: a `vellum/` edit for per-peer secrets. Trade-off: a peer could pass the gateway layer
as another peer, but not the plugin layer. Revisit after Phase 6 runs live.

## D-11 · Root `package.json` for tests and typecheck · Proposed (chosen overnight, revisit)
`bun run check` runs `tsc` and `bun test ./backend ./integrations` (never inside `vellum/`).
Dev dependencies only, pinned to Vellum's versions: `typescript` 5.9.3, `@types/bun` 1.3.10.
`@vellumai/plugin-api` types come from a small shim in `integrations/_shared-types/`. No runtime
dependencies: SQLite is `bun:sqlite`, crypto is `node:crypto`.

## D-13 · Peer messages never run a model turn · Proposed (chosen overnight, revisit)
A2A routes are plain webhooks (no `"inbound"`): the plugin checks the peer, stores the note or
task, and tells the owner with a turn in the owner's own conversation. Gates A and C are tools
only the owner (guardian) can call, with a fresh approval. Instead of: running the peer's message
as a non-owner turn and relying on Vellum's non-owner escalation (the protocol doc's original
idea). Why: the peer's text never reaches a model as a speaker, so it cannot talk the model into
anything; and it avoids depending on live behaviour Phase 0 could not test. Trade-off: the peer
cannot chat with Sujal directly; questions go through the owner. Revisit once Spike A/B run live.

## D-14 · Wire format uses Vellum's real A2A field names · Proposed (chosen overnight)
`vellum/assistant/src/a2a/protocol-types.ts` uses snake_case (`message_id`, `context_id`,
`task_id`, `artifact_id`) and file bytes in `raw`. Our envelope follows that, not the camelCase in
the protocol doc's first draft, so a later switch to Vellum's built-in A2A stays possible. The
protocol doc example is updated to match.

## D-12 · Every outside service behind an adapter, mock by default · Proposed (chosen overnight)
Twilio, Meta WhatsApp, TTS and LLM calls in our code go through small interfaces. The mock is used
unless `BUNTY_ADAPTERS=real`; the real one reads its key from env and throws
`NotConfiguredError` naming the missing variable. No real calls or messages are sent by tests.
