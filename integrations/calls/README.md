# calls

Phone calls are **built into Vellum** (Twilio Media Streams, Deepgram STT, ElevenLabs TTS). This
folder holds setup notes only. Phase 4. Details:
[`docs/architecture/channels-phone-whatsapp.md`](../../docs/architecture/channels-phone-whatsapp.md).

## Secrets

Twilio account SID, auth token, phone number (service `twilio`, via the `twilio-setup` skill),
Deepgram and ElevenLabs keys. Never paste them in chat; use the secure prompt.

## Setup

1. In your assistant: "set up phone calls" (loads the `phone-calls` skill, which loads
   `twilio-setup`, `public-ingress`, `elevenlabs-voice`).
2. Voice config for India: `services.stt.language multi`, Hindi voices in
   `services.tts.providers.elevenlabs.languageVoices`, `calls.disclosure.enabled true`.
3. Verify yourself as owner by phone code (`guardian-verify-setup`).
4. From Phase 3, the Twilio number's voice webhook points at the router `/twilio/voice`.

## Scripts

- `scripts/voice-config.ts`: prints the India voice config commands (dry run); `--apply` runs them.
  Voice ids come from `ELEVENLABS_VOICE_HI`, `ELEVENLABS_VOICE_EN`, `ELEVENLABS_VOICE_GU`.
- `scripts/exit-check.ts calls.csv`: the Phase 4 exit check. One line per test call:
  `ok,first_reply_ms,language`, for example `1,1800,hi`. Passes with at least 10 calls, at most 1
  failure and an average first reply under 2.5 s.

## How to test

`bun test integrations/calls` (no keys needed).

Own numbers only. Inbound call asking about something it remembers. Outbound
`call_start` to your second phone. Note latency and language quality in Notion, and keep the CSV
for `exit-check.ts`.
