# backend/router

Finds the right person's assistant for every call and WhatsApp message that arrives on our shared
numbers. Bun + TypeScript (same as Vellum). Status: **Proposed**, confirm with the team before the
first commit (AGENTS.md section 3).

## What it does

- `POST /whatsapp` (Meta webhook): reads the sender's number, looks up the assistant, forwards the
  **raw body and `X-Hub-Signature-256` unchanged** to `https://<assistant>/webhooks/whatsapp`.
  Every assistant is configured with the same `app_secret`, so its gateway check still passes.
- `GET /whatsapp`: answers Meta's `hub.challenge` with the shared verify token.
- `POST /twilio/voice`: checks Twilio's signature, looks up the caller, answers TwiML
  `<Redirect method="POST">https://<assistant>/webhooks/twilio/voice</Redirect>`.
- `POST /outbound-hint` (internal, signed): an assistant tells the router "I just messaged or
  called non-user X", so X's replies for the next 24 h go back to that assistant.
- Unknown numbers get a short onboarding reply (WhatsApp) or message (call).

## Data

SQLite `router.db`:

| Table | Columns |
| --- | --- |
| `users` | `phone_e164` (PK), `assistant_id`, `assistant_base_url`, `status`, `created_at` |
| `sticky_routes` | `counterparty_e164`, `assistant_id`, `expires_at` |
| `consent` | `phone_e164`, `kind` (recording, data use), `granted_at` |

No message bodies are stored. Logs show the last 4 digits of numbers only.

## Secrets (`.env`)

`ROUTER_WHATSAPP_APP_SECRET`, `ROUTER_WHATSAPP_VERIFY_TOKEN`, `ROUTER_TWILIO_AUTH_TOKEN`,
`ROUTER_INTERNAL_HMAC_KEY`. Add the names to the root `.env.example`.

## How to test

1. `bun test backend/router` (unit: lookup, stickiness expiry, signature pass-through).
2. Two local assistants (see `infra/README.md`) and one test number per teammate. Send a WhatsApp
   from each and check it lands in the right assistant.
3. Call the shared number from each test phone and check the right assistant answers.
