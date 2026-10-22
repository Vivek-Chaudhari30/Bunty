# reach-contact

One tool, `reach_contact`, that turns "call / text / tell X that Y" into the right action, reads
the plan back to the owner, waits for a clear yes, then acts and reports the result. Phase 5.

## Decision order

1. Resolve the person with `contact_search` (and memory). None: ask the owner. Several: ask which.
2. Normalize to E.164 (`+91` default for India, ask if unsure). Refuse emergency numbers.
3. Pick the route:
   - The owner said "call" -> phone (`call_start`).
   - The owner said "text" / "WhatsApp" -> WhatsApp (`messaging_send`), unless the contact is a
     Bunty user, then A2A note (decisions D-05).
   - Work to be done, or "tell their assistant" -> A2A task via `a2a-delegation`.
   - Otherwise: paired peer -> A2A note; else WhatsApp; else call.
4. Read back: who, which number or assistant, which route, the exact words. Buttons:
   `[Go] [Change] [Cancel]`. Checked in code (`defaultRiskLevel: "high"`,
   `requireFreshApproval: true`), unless the owner has a scoped grant for this contact.
5. Act. For non-users, tell the router (`/outbound-hint`) so replies come back here.
6. Report back in the owner's chat: call outcome, delivery, or task id.

## Layout

```
reach-contact/
├── package.json
├── tools/reach_contact.ts
├── skills/reach-contact/SKILL.md    wording rules: short, plain, Hindi/English as the owner speaks
└── src/route-policy.ts              pure function, unit tested
```

## Secrets

None of its own. Uses Twilio and WhatsApp credentials already in the assistant, and
`ROUTER_INTERNAL_HMAC_KEY` for the router hint.

## How to test

`bun test integrations/reach-contact` for `route-policy.ts`, then on own numbers only:
call, text, A2A note, ambiguous name, unknown name, emergency number refused.
