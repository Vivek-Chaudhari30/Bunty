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
