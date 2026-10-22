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
