# whatsapp

WhatsApp is **built into Vellum**. This folder holds setup notes and, only if needed, a small plugin
for gaps (voice-note replies, templates). Phase 2. Details:
[`docs/architecture/channels-phone-whatsapp.md`](../../docs/architecture/channels-phone-whatsapp.md).

## Secrets

Service `whatsapp`: `phone_number_id`, `access_token`, `app_secret`, `webhook_verify_token`.
`assistant credentials prompt --service whatsapp --field <name>` for each.

## Setup

1. Meta developer app, add WhatsApp, get a test number and add your own phone as a recipient.
2. Store the 4 secrets in your assistant.
3. Phase 2: point the Meta webhook at your assistant's public gateway URL `/webhooks/whatsapp`.
   From Phase 3: point it at the router `/whatsapp` instead.

## How to test

Text, Hindi voice note, photo, PDF from your own phone. Then trigger a tool that needs approval
and check the buttons work.

### Without a Meta account (test kit)

`src/test-webhook.ts` builds Meta-shaped webhook payloads (text, voice note, photo, document,
approval button) and signs them like Meta does (`X-Hub-Signature-256`). Use it against your own
local gateway or the router only:

```bash
bun test integrations/whatsapp
WHATSAPP_APP_SECRET=<the app_secret stored in your assistant> \
  bun integrations/whatsapp/scripts/send-test-webhook.ts \
  http://localhost:<gateway-port>/webhooks/whatsapp text 910000000001 "remind me at 7 PM"
```

Text works end to end. Voice notes, photos and documents use fake media ids, so the gateway's
download from Meta fails until real keys exist; the payload shape is still checked.

## Owner on WhatsApp: needs a `vellum/` change (not done)

Checked in source. Both need a small edit inside `vellum/`, which needs the team's OK first
(AGENTS.md section 5), so neither was changed:

| Gap | Where | What the edit would be |
| --- | --- | --- |
| WhatsApp cannot verify the owner (`supportsVerification: false`) | `vellum/assistant/src/channels/types.ts` (WhatsApp entry), `vellum/gateway/src/verification/identity-match.ts` | Turn verification on for WhatsApp and match the sender's phone number to the guardian's verified phone. |
| Owner approvals and call questions go only to the desktop (`vellum`) conversation | `vellum/assistant/src/calls/guardian-dispatch.ts` (`getGuardianDelivery({ channelTypes: ["vellum"] })`) | Also deliver to the guardian's WhatsApp binding when one exists. |

Until then, approvals reach the owner on the desktop app or Telegram.
