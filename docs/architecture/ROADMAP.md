# Roadmap

Each phase ends with something a teammate can try on their own phone. Do the phases in order. Do
not start a phase until the previous one's exit check passes and the team has reviewed the PR.
After every phase, update the Notion feature page and standup log (AGENTS.md section 7).

Order follows AGENTS.md section 6 (reminders, WhatsApp, calls first), then adds the
assistant-to-assistant work.

| Phase | Name | Main output | Touches `vellum/`? |
| --- | --- | --- | --- |
| 0 | Two assistants + spikes | Chintu and Sujal running locally; 3 assumptions checked | No |
| 1 | Reminders | Built-in schedules configured and documented | No |
| 2 | WhatsApp | Owner talks to their assistant on WhatsApp, voice notes work | Maybe (owner binding) |
| 3 | Router | Shared numbers reach the right assistant | No |
| 4 | Phone calls | Owner calls in; assistant calls out in Hindi/English | No |
| 5 | reach-contact | "Call / text X and tell them Y" with confirmation | No |
| 6 | A2A pairing + notes | Chintu and Sujal paired; short notes pass between owners | No |
| 7 | A2A delegation | Tasks with Gates A/B/C, status, files, deadlines | No |
| 8 | Hardening | Privacy, limits, voice replies, server deploy | Maybe |

---

## Phase 0: two assistants and three spikes

Goal: prove the plugin approach works before building on it.

Steps:
1. Follow README "How to run" to hatch two assistants: `chintu` and `sujal` (two workspaces, or
   `vellum hatch --remote docker` twice). Name them in `IDENTITY.md`.
2. Spike A: a throwaway plugin with `channels/ingress.json` + `"inbound": {}` receives a POST and
   starts a turn. Check the turn's actor is a **non-owner** contact.
3. Spike B: in that turn, call a plugin tool with `defaultRiskLevel: "high"` and
   `requireFreshApproval: true`. Check the owner gets an approval prompt (desktop or Telegram is
   fine for now) and the tool waits.
4. Spike C: from a plugin tool, run `runConversationTurn` (plugin API `conversation-turn.ts`) or
   post into an existing owner conversation, so a plugin can tell the owner something.

Exit check: a 1-page note in Notion with the result of A, B, C. If B fails, stop and discuss
(fallback: small `vellum/` edit, see decisions D-03).

## Phase 1: reminders

Steps: configure Vellum schedules/reminders, write `integrations/reminders/README.md` (setup only),
test "remind me at 7 PM to call home" end to end in the terminal client.

Exit check: reminder fires on time in two time zones (India and UK/US teammates).

## Phase 2: WhatsApp

Steps:
1. Meta developer app + WhatsApp test number. Store the 4 credentials in each assistant.
2. Expose each assistant's gateway (Vellum `public-ingress` skill or Velay) and set the Meta
   webhook to it directly (router comes in Phase 3).
3. Test text, voice note (Hindi and English), photo, document.
4. Owner on WhatsApp: make approvals and call questions reach the owner on WhatsApp; add
   phone-number owner binding for WhatsApp. Ask before editing `vellum/` (likely
   `calls/guardian-dispatch.ts` and the WhatsApp verification flag).
5. Write `integrations/whatsapp/README.md` (setup, test steps).

Exit check: owner sends a Hindi voice note, gets a correct text reply; a sensitive tool shows
WhatsApp approval buttons and works.

## Phase 3: router

Steps: build `backend/router` per its README; one Meta webhook + one Twilio number pointing at the
router; onboarding writes `users` rows; outbound hint endpoint; Docker service in `infra/`.

Exit check: two teammates message and call the same shared number and each reaches their own
assistant; an unknown number gets the onboarding reply.

## Phase 4: phone calls

Steps:
1. Twilio account + one number. Load the `phone-calls` skill in each assistant, set voice config
   from `channels-phone-whatsapp.md`.
2. Owner guardian verification by phone code.
3. Inbound: owner calls, asks something that uses memory.
4. Outbound: "call my test number and say hello" (own numbers only).
5. Measure: first-reply latency, Hindi/Hinglish/Gujarati transcription quality. Record in Notion.

Exit check: 10 test calls, at most 1 failure, average first reply under 2.5 s.

## Phase 5: integrations/reach-contact

Steps: build the plugin per its README: `reach_contact` tool + skill; resolve contact; choose
route; read back plan and wait for "yes" in code; dispatch via `call_start` or `messaging_send`;
post outcome to the owner's chat; router outbound hint for non-users. Template message support if
WhatsApp first-contact is needed.

Exit check: "Call Owner B's test number and tell him I'll be there at 6 PM" works from a WhatsApp
voice note, with confirmation, and the result comes back on WhatsApp. Same for "text him instead".

## Phase 6: integrations/a2a-delegation, part 1 (pairing + notes)

Steps: plugin skeleton, `channels/ingress.json`, invite/redeem/unpair, HMAC signing, peer
records, `taskType: "note"` end to end, `reach-contact` prefers A2A when the contact is paired.

Exit check: Chintu and Sujal pair via link; "tell Owner B I'll be there at 6" arrives on Owner B's
WhatsApp via Sujal; forged or replayed requests are rejected (tests).

## Phase 7: integrations/a2a-delegation, part 2 (tasks and gates)

Steps: `taskType: "task"`, `accept_delegation` (Gate A), Gate B through Vellum gating,
`release_delegation_result` (Gate C) with hash check, status pushes, outbound tracker,
follow-up + deadline schedule, cancel, file parts (inline and signed URL), a `.pptx` deck skill
(ask first: which library).

Exit check: the full "three presentations by tomorrow" scenario works between two teammates'
assistants, including decline, cancel, a question back to the requester, and a missed deadline.

## Phase 8: hardening

Steps: "delete my data", consent records, rate limits, audit log of outward actions, voice-note
replies, server deploy with Docker Compose for N assistants + router, monitoring. Consider CES for
provider tokens. Exotel and Sarvam as separate integrations later.

Exit check: a new tester can onboard from the website in under 5 minutes and everything above
works on the server.
