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

## Code

| File | What it does |
| --- | --- |
| `src/app.ts` | All routes. Pure: store and outside services come in as arguments |
| `src/store.ts` | SQLite tables above, plus `onboarding_replies` (one reply per unknown number per day) |
| `src/signatures.ts` | Meta, Twilio and internal (`X-Bunty-Timestamp` + `X-Bunty-Signature`) checks |
| `src/whatsapp-payload.ts` | Finds who a webhook is about; splits a batched webhook per person |
| `src/adapters.ts` | `WhatsAppSender` (mock by default, Meta when `BUNTY_ADAPTERS=real`), `Forwarder` |
| `src/main.ts` | Starts the server |
| `scripts/add-user.ts` | Writes a `users` row through `POST /internal/users` |

Behaviour worth knowing:
- A webhook for one assistant is forwarded byte-for-byte with Meta's signature. A batched webhook
  for several people is split, and each part is re-signed with the shared app secret.
- If an assistant's gateway is down the router answers 502, so Meta retries; gateways drop
  duplicate message ids.
- `POST /outbound-hint` for a number that belongs to a user is ignored: user-to-user goes
  assistant to assistant (decision D-05).
- `POST /internal/users` body: `{ "phone", "assistantId", "assistantBaseUrl", "status"? }`.
- Phase 8: `POST /internal/users/delete` (`{ "phone" }`, "delete my data"),
  `POST /internal/consent` (`{ "phone", "kind": "recording" | "data_use" }`), `GET /metrics`.
  Rate limits per sender number: 30 WhatsApp messages and 5 calls per minute (`src/limits.ts`);
  over the limit, messages are dropped with a 200 (no Meta retry) and calls hear a busy message.
  The `audit` table records onboarding replies and deletions (last 4 digits only).

## How to run

```bash
cp .env.example .env             # fill in ROUTER_* (any random strings work locally)
bun run router                   # from the repo root; listens on ROUTER_PORT (8787)
ROUTER_INTERNAL_HMAC_KEY=... bun backend/router/scripts/add-user.ts \
  http://localhost:8787 "+91 00000 00001" chintu http://localhost:<chintu-gateway-port>
WHATSAPP_APP_SECRET=<same as ROUTER_WHATSAPP_APP_SECRET> \
  bun integrations/whatsapp/scripts/send-test-webhook.ts http://localhost:8787/whatsapp text 910000000001
```

Docker: `docker compose -f infra/docker-compose.yml up -d --build`.

## How to test

1. `bun test backend/router` (unit: lookup, stickiness expiry, signature pass-through).
2. Two local assistants (see `infra/README.md`) and one test number per teammate. Send a WhatsApp
   from each and check it lands in the right assistant.
3. Call the shared number from each test phone and check the right assistant answers.
