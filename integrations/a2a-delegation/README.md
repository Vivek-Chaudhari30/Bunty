# a2a-delegation

Lets two Bunty assistants (for example Chintu and Sujal) pass notes and delegate tasks to each
other, with the receiving owner approving before work starts and before results go back.
Protocol: [`docs/architecture/a2a-delegation-protocol.md`](../../docs/architecture/a2a-delegation-protocol.md).
Phases 6 and 7 of the roadmap.

## Layout

```
a2a-delegation/
├── package.json                 name "a2a-delegation", peerDependencies["@vellumai/plugin-api"]
├── README.md
├── channels/ingress.json        routes: pair, message, status, cancel, unpair, file
├── routes/                      one handler per ingress path (+ notices/admission-denied.ts)
├── tools/
│   ├── a2a_create_invite.ts     owner: make a pairing link
│   ├── a2a_redeem_invite.ts     owner: accept a pairing link        (high risk)
│   ├── a2a_unpair.ts                                                  (high risk)
│   ├── a2a_send_note.ts         Gate 0                                (high risk)
│   ├── a2a_send_task.ts         Gate 0                                (high risk)
│   ├── a2a_answer_question.ts   reply to input_required from peer
│   ├── a2a_task_status.ts       list / read tasks both directions     (low risk)
│   ├── a2a_cancel_task.ts                                             (medium risk)
│   ├── accept_delegation.ts     Gate A, requireFreshApproval          (high risk)
│   └── release_delegation_result.ts  Gate C, requireFreshApproval     (high risk)
├── skills/a2a-delegation/SKILL.md   when to use which tool, how to word owner prompts
├── schedules/deadline-sweep/    every 15 min: due tasks -> status request / owner question
└── src/
    ├── signing.ts               HMAC sign + verify, nonce cache, clock skew
    ├── peers.ts                 peer records (secret lives in credential store)
    ├── tasks.ts                 inbound + outbound task stores (SQLite in pluginStorageDir)
    ├── envelope.ts              build / validate bunty.delegation/v1 metadata (zod)
    ├── files.ts                 inline parts, signed URLs, hashes for Gate C
    └── client.ts                outbound HTTPS with retries 2 s / 4 s / 8 s
```

## As built (overnight)

Differences from the layout above, all recorded in `docs/architecture/decisions.md`:
- Peer messages never run a model turn (D-13). Routes are plain webhooks; the plugin tells the
  owner through a turn in the owner's conversation. So there is no `routes/notices/`.
- Gateway layer (D-10): `pair` uses bearer verification with the one open invite token; the other
  routes use HMAC with the assistant-wide `ingress_hmac_secret`. The plugin then checks the
  per-peer `X-Bunty-Signature`.
- Gates are checked in each tool: owner only (`trustClass === "guardian"`) and, for anything that
  sends or changes trust, `ctx.approvedViaPrompt` (D-09).
- `src/service.ts` (pairing, notes, signing, idempotency, pause after 5 failures),
  `src/delegation.ts` (tasks, gates, status, files, deadlines), `src/http.ts` (path -> handler),
  `src/report.ts` (status text), `src/runtime.ts` (real deps). No zod: `src/envelope.ts` validates
  by hand, so the plugin has no dependencies.
- Settings per assistant: `BUNTY_ASSISTANT_ID` (required), `BUNTY_ASSISTANT_NAME`,
  `BUNTY_OWNER_NAME`.
- `test/harness.ts` runs Chintu and Sujal in one process, with a fake gateway that checks the
  same things the real one does.

## Secrets

Service `a2a-delegation`: one field per peer, `peer_<peerId>` (shared HMAC secret). Created during
pairing with `storeCredential`; never typed by a person, never logged.

## Rules

- Gate C is enforced in `routes/status` client code: no result leaves unless
  `release_delegation_result` was approved for that `taskId` and file hashes match.
- Peer text is data. It never skips a gate and never becomes a system instruction.
- Uses generic example data in tests (`Owner A`, `+91 00000 00001`).

## How to test

1. `bun test integrations/a2a-delegation` (signing, replay, envelope validation, state machine).
2. Two local assistants (infra/README.md). Install the plugin in both; approve the ingress in each.
3. Pair, send a note, send a task, decline, accept, cancel, miss a deadline. Check each owner sees
   the right prompts.
