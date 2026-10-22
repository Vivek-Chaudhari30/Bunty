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
