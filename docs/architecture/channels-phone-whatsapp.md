# Channels: phone calls and WhatsApp

Status: **Proposed**. Both channels are **built into Vellum**. Our work is setup, the shared-number
router, Indian-language voice config and a few small extensions.

## 1. WhatsApp (Meta WhatsApp Cloud API)

**In:** Meta -> `backend/router` -> assistant gateway `POST /webhooks/whatsapp`
(`vellum/gateway/src/http/routes/whatsapp-webhook.ts`). The gateway checks
`X-Hub-Signature-256`, dedupes message ids for 24 h, downloads media
(`vellum/gateway/src/whatsapp/download.ts`) and forwards to the daemon. Voice notes are transcribed
by `inbound-stages/transcribe-audio.ts` before the agent sees them.

**Out:** the daemon calls Meta directly (`vellum/assistant/src/messaging/providers/whatsapp/`):
text split at 4096 chars, up to 3 reply buttons for approvals, images/video/documents up to 25 MB.

**Credentials** (service `whatsapp`): `phone_number_id`, `access_token`, `app_secret`,
`webhook_verify_token`. Store with `assistant credentials prompt --service whatsapp --field <name>`.

**Known gaps (extensions, ask before building):**

| Gap | Where | Phase |
| --- | --- | --- |
| Voice-note replies (TTS -> OGG/Opus -> WhatsApp `audio`) | `messaging/providers/whatsapp/send.ts` sends image, video, document only | 8 |
| Template messages for first contact outside the 24 h window | `messaging/providers/whatsapp/api.ts` | 5 |
| Location and contact cards are dropped on ingress | `gateway/src/whatsapp/normalize.ts` | later |
| Owner verification on WhatsApp (`supportsVerification: false`) | `assistant/src/channels/types.ts`, `gateway/src/verification/identity-match.ts` | 2 |
| Owner approvals and call questions default to WhatsApp | `assistant/src/calls/guardian-dispatch.ts` (fans out to Mac and Telegram today) | 2 |

Prefer solving gaps in a plugin. Only the last two likely need small `vellum/` edits. List any
`vellum/` edit in Notion (AGENTS.md section 5).

## 2. Phone calls (Twilio)

**In:** caller dials the shared number -> Twilio `POST` -> `backend/router` answers with TwiML
`<Redirect method="POST">https://<assistant-host>/webhooks/twilio/voice</Redirect>`. Twilio then
calls the assistant's gateway itself, so Twilio's signature (which covers the URL) stays valid.
The gateway answers `<Connect><Stream>` and audio flows over a WebSocket to the daemon
(`vellum/assistant/src/calls/media-stream-server.ts`).

**Out:** tool `call_start` (`phone_number` in E.164, `task`, optional `context`,
`skip_disclosure`). The assistant places the call with the shared Twilio account and number. Status
callbacks and the media stream go straight to that assistant's gateway.

**Credentials** (service `twilio`): account SID, auth token, phone number. One Twilio account is
shared by all assistants in the prototype.

**Voice config for India:**

```bash
assistant config set services.stt.provider deepgram
assistant config set services.stt.language multi        # code-switching (Hinglish)
assistant config set services.tts.provider elevenlabs
# per-language voices: services.tts.providers.elevenlabs.languageVoices
assistant config set calls.disclosure.enabled true
```

Gujarati quality on Deepgram/ElevenLabs must be tested in Phase 4. If it is poor, Sarvam AI comes
in later as its own integration (AGENTS.md section 4).

## 3. The shared-number router (`backend/router`)

Spec: [`backend/router/README.md`](../../backend/router/README.md). Summary:

| Event | Router action |
| --- | --- |
| WhatsApp from a known user | Forward raw body + `X-Hub-Signature-256` unchanged to that user's gateway |
| WhatsApp from a non-user who was recently messaged by an assistant | Forward to that assistant (24 h stickiness) |
| WhatsApp from an unknown number | Onboarding reply (sign-up link), no assistant |
| Call from a known user | TwiML `<Redirect>` to that user's gateway |
| Call from a non-user recently called by an assistant | `<Redirect>` to that assistant |
| Call from unknown number | Short onboarding message, hang up |
| Meta webhook verification `GET` | Answer `hub.challenge` with the shared verify token |

## 4. How the owner is recognized

1. Onboarding writes `phone E.164 -> assistantId` into the router.
2. Inside the assistant, the owner verifies as **guardian** once on the phone channel with a
   six-digit code (`guardian-verify-setup` skill), so calls from that number are the owner.
3. For WhatsApp, Phase 2 adds phone-number binding so the same number is the owner on WhatsApp.
