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

## Layout (as built)

```
reach-contact/
├── package.json
├── tools/
│   ├── reach_contact_plan.ts        low risk: pick the route, save a plan, return the read-back
│   └── reach_contact.ts             high risk: send an approved plan (owner approves every call)
├── skills/reach-contact/SKILL.md    when and how; short, plain, Hindi/English as the owner speaks
└── src/
    ├── route-policy.ts              pure: verb + contact facts -> route (unit tested)
    ├── phone.ts                     E.164 + emergency/helpline numbers (Vellum's + India's)
    ├── plan.ts                      plans: read-back, digest, one-time use, 30 min expiry
    ├── router-hint.ts               signed POST /outbound-hint (mock by default)
    ├── core.ts                      the tools' logic, testable without Vellum
    └── runtime.ts                   real deps inside an assistant
```

How the confirmation is enforced (decision D-09): `reach_contact_plan` saves the exact plan and
returns its read-back. `reach_contact` is `high` risk **and** refuses unless
`ctx.approvedViaPrompt` is true, the plan is unused, under 30 minutes old, and unchanged
(digest). Plugins cannot call Vellum tools directly, so `reach_contact` returns the exact
`call_start` / `messaging_send` / `a2a_send_note` / `a2a_send_task` call for the model to make;
those tools have their own Vellum gating, so the owner may see a second prompt. Revisit live.

## Secrets and settings

None of its own. Uses Twilio and WhatsApp credentials already in the assistant. For the router
hint (`BUNTY_ADAPTERS=real`): `BUNTY_ROUTER_URL`, `ROUTER_INTERNAL_HMAC_KEY`, and
`BUNTY_ASSISTANT_ID` (this assistant's id in the router).

## How to test

`bun test integrations/reach-contact` (no keys needed), then on own numbers only:
call, text, A2A note, ambiguous name, unknown name, emergency number refused.
