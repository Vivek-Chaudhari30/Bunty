# spike-plugin-channel

Throwaway plugin for Phase 0 (ROADMAP.md). Delete it once the three spikes are confirmed on a live
assistant. Results so far: `docs/architecture/OVERNIGHT-LOG.md`, Phase 0.

- **Spike A**: `channels/ingress.json` + `routes/inbound.ts`. A signed POST becomes a turn from a
  non-owner contact.
- **Spike B**: `tools/spike_fresh_approval.ts`. High-risk tool that refuses unless
  `ctx.approvedViaPrompt` is true.
- **Spike C**: `tools/spike_notify_owner.ts`. Posts into an owner conversation with
  `runConversationTurn`.

## Secrets

`spike_ingress_secret` (any random value, test only):
`assistant credentials prompt --service spike-plugin-channel --field spike_ingress_secret`.

## How to test

1. `bun test integrations/spike-plugin-channel` (no keys needed).
2. Live (needs an LLM key): install into a local assistant, approve the ingress, then:

```bash
BODY='{"text":"hello from a test contact","from":"+910000000002","chatId":"spike-1","messageId":"m1"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SPIKE_SECRET" | sed 's/^.* //')
curl -X POST "$GATEWAY/webhooks/plugins/spike-plugin-channel/inbound" \
  -H "X-Spike-Signature: sha256=$SIG" -H 'content-type: application/json' -d "$BODY"
```

Check the new conversation's actor is a contact (not the guardian). Then, in that conversation,
ask for "run the approval spike" and check the owner gets the prompt.
