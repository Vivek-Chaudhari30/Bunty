# infra

How we run the router and many assistants. Status: **Proposed**.

## Local (Phases 0 to 7): two assistants on one laptop

Two Vellum assistants named `chintu` and `sujal`, each with its own workspace and gateway port,
so A2A and routing can be tested without a server.

```bash
cd vellum
vellum hatch            # first assistant -> name it chintu in IDENTITY.md
vellum hatch            # second assistant -> sujal (or use --remote docker for each)
vellum ps               # both should be listed
```

Every assistant users talk to is named **Bunty** (Chintu and Sujal are only the example names in
our docs and tests). Set the name and personality in each workspace, before the first
`vellum wake` or at any time later (the daemon reloads the files):

```bash
bun infra/scripts/set-bunty-identity.ts --workspace <assistant workspace dir> --dry-run
bun infra/scripts/set-bunty-identity.ts --workspace <assistant workspace dir>
```

It writes `IDENTITY.md`, replaces only the `## Personality` section of `SOUL.md`, and backs up
anything it changes to `<workspace>/.bunty-backups/`. Source text lives in
`infra/scripts/bunty-identity/`. Without `--workspace` it uses `$VELLUM_WORKSPACE_DIR`, then
`~/.vellum/workspace`.

Expose each gateway with the Vellum `public-ingress` skill (or Velay) when Meta, Twilio or the
other assistant must reach it. Use test numbers and your own phones only.

## Server (Phase 8)

One cloud VM, Docker Compose:

| Service | Image | Notes |
| --- | --- | --- |
| `router` | `backend/router` | Public: `/whatsapp`, `/twilio/voice` |
| `assistant-<id>` | `vellum hatch --remote docker` per tester | Gateway public at `https://<id>.<domain>` |
| `caddy` | reverse proxy + TLS | One subdomain per assistant |

Backups: each assistant's workspace volume nightly. No call recordings or transcripts leave the VM.

## Server deploy (as built, Phase 8)

1. One VM with Docker and Bun. Point DNS `router.<domain>` and `*.<domain>` at it.
2. `cp .env.example .env` and fill in the `ROUTER_*` values (plus `ROUTER_METRICS_TOKEN`).
3. Hatch one assistant per tester with `vellum hatch --remote docker`; note each gateway port
   (`vellum ps`). In each assistant set `BUNTY_ASSISTANT_ID`, `BUNTY_ROUTER_URL`,
   `BUNTY_ASSISTANT_NAME`, `BUNTY_OWNER_NAME`.
4. `cp infra/assistants.example.json infra/assistants.json`, fill in domain, email, ids, ports.
   `bun backend/deploy/scripts/gen-caddyfile.ts` writes `infra/Caddyfile` (both files are
   git-ignored).
5. `docker compose -f infra/docker-compose.yml --profile server up -d --build`.
6. Register each tester: `bun backend/router/scripts/add-user.ts https://router.<domain>
   <phone> <id> https://<id>.<domain>`. Point the Meta webhook at
   `https://router.<domain>/whatsapp` and the Twilio voice webhook at
   `https://router.<domain>/twilio/voice`.

## Monitoring

- `GET /healthz` (Compose healthcheck) and `GET /metrics` on the router (Prometheus text,
  counters only, no numbers; bearer `ROUTER_METRICS_TOKEN` when set): forwarded, forward errors,
  bad signatures, rate limited, onboarding sent, calls by outcome.
- Router logs are JSON lines with the last 4 digits of numbers only.
- Audit logs: router `audit` table (onboarding replies, deletions); `a2a-delegation` `audit`
  table (every request sent to another assistant, ids only); `reach-contact` `audit.jsonl`
  (every approved send, last 4 digits or peer id). None store message text.

## "Delete my data" runbook

1. In the person's assistant: they say "delete my data". `a2a_delete_my_data` disconnects every
   paired assistant and wipes that plugin's data; `reach_contact_delete_data` removes plans and
   the send log.
2. Router: `POST /internal/users/delete` (signed, body `{ "phone": "+91..." }`) removes their
   routing row, consent and sticky routes, and returns the assistant id.
3. Operator: `vellum retire <id>`. Retire **archives** the workspace, so also delete that archive.
4. Remove the assistant from `infra/assistants.json`, regenerate the Caddyfile, reload Caddy.
