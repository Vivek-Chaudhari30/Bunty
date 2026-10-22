// The assistant-to-assistant service: pairing, notes, and (Phase 7) tasks.
// One instance per assistant. Every outside piece comes in through `deps`.
import { createHash, randomUUID } from "node:crypto";
import type { A2ADb, PeerRow } from "./db.ts";
import { buildMessageRequest, delegationMeta, parseMessageRequest, quotePeer, textOf } from "./envelope.ts";
import type { OwnerNotifier } from "./notifier.ts";
import { FIELDS, type SecretStore } from "./secrets.ts";
import {
  FAILURE_WINDOW_MS,
  FAILURES_BEFORE_PAUSE,
  NonceCache,
  randomSecret,
  RateLimiter,
  signedHeaders,
  verifyPeerRequest,
} from "./signing.ts";
import { postWithRetry, type PeerResponse, type Transport } from "./transport.ts";
import { DELEGATION_KEY, type A2AMessage, type A2ATask, type DelegationMeta } from "./types.ts";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAIR_PATH = "pair";

export interface ServiceDeps {
  db: A2ADb;
  secrets: SecretStore;
  transport: Transport;
  notifier: OwnerNotifier;
  /** This assistant's id (BUNTY_ASSISTANT_ID), e.g. "chintu". Peers know us by it. */
  selfId: string;
  /** Assistant name and owner name, e.g. "Chintu" and "Owner A". */
  selfName: string;
  ownerName: string;
  /** Public base of our plugin routes: https://<host>/webhooks/plugins/a2a-delegation */
  selfBaseUrl: () => Promise<string>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
}

export class A2AError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "A2AError";
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export class A2AService {
  protected readonly nonces = new NonceCache();
  protected readonly limiter = new RateLimiter();

  constructor(readonly deps: ServiceDeps) {}

  protected now(): number {
    return (this.deps.now ?? Date.now)();
  }
  protected log(msg: string, fields?: Record<string, unknown>) {
    this.deps.log?.(msg, fields);
  }
  protected peerLabel(p: PeerRow): string {
    return `${p.owner_name}'s assistant ${p.display_name}`;
  }

  /** Our gateway secret, created on first use. Peers sign X-Bunty-Gateway-Signature with it. */
  async ingressSecret(): Promise<string> {
    let s = await this.deps.secrets.get(FIELDS.ingress);
    if (!s) {
      s = randomSecret();
      await this.deps.secrets.set(FIELDS.ingress, s);
    }
    return s;
  }

  // ── Pairing ────────────────────────────────────────────────────────────

  /** Owner A: make a one-time link for Owner B's assistant. Only one invite is open at a time. */
  async createInvite(): Promise<{ link: string; expiresAt: number }> {
    const token = randomSecret();
    const now = this.now();
    this.deps.db.addInvite({ token_hash: sha256(token), expires_at: now + INVITE_TTL_MS, used_at: null, created_at: now });
    // The gateway checks the pair route's bearer token against this field (decision D-10).
    await this.deps.secrets.set(FIELDS.pairToken, token);
    await this.ingressSecret();
    return { link: `${await this.deps.selfBaseUrl()}/${PAIR_PATH}?token=${token}`, expiresAt: now + INVITE_TTL_MS };
  }

  /** Owner B: redeem Owner A's link. Exchanges secrets with the inviter over TLS. */
  async redeemInvite(link: string): Promise<PeerRow> {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      throw new A2AError("That doesn't look like a pairing link.");
    }
    const token = url.searchParams.get("token");
    if (!token || !url.pathname.endsWith(`/${PAIR_PATH}`)) throw new A2AError("That doesn't look like a pairing link.");
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".localhost")) {
      throw new A2AError("Pairing links must use https.");
    }
    const peerBase = `${url.origin}${url.pathname.slice(0, -PAIR_PATH.length - 1)}`;
    const body = JSON.stringify({
      token,
      peerId: this.deps.selfId,
      displayName: this.deps.selfName,
      ownerName: this.deps.ownerName,
      baseUrl: await this.deps.selfBaseUrl(),
      ingressSecret: await this.ingressSecret(),
    });
    const res = await this.deps.transport.post(`${peerBase}/${PAIR_PATH}`, { "content-type": "application/json", authorization: `Bearer ${token}` }, body);
    if (res.status !== 200) throw new A2AError(`The other assistant refused the link (HTTP ${res.status}). Ask for a new link.`);
    const r = JSON.parse(res.body) as { peerId: string; displayName: string; ownerName: string; sharedSecret: string; ingressSecret: string };
    if (!r.peerId || !r.sharedSecret || !r.ingressSecret) throw new A2AError("The other assistant sent an incomplete answer.");
    const peer: PeerRow = { peer_id: r.peerId, display_name: r.displayName, owner_name: r.ownerName, base_url: peerBase, status: "active", created_at: this.now() };
    await this.deps.secrets.set(FIELDS.peer(r.peerId), r.sharedSecret);
    await this.deps.secrets.set(FIELDS.peerIngress(r.peerId), r.ingressSecret);
    this.deps.db.upsertPeer(peer);
    return peer;
  }

  /** Inviter side of `POST pair`. The gateway already checked the bearer token. */
  async handlePair(req: Request): Promise<Response> {
    const raw = await req.text();
    let b: Record<string, unknown>;
    try {
      b = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const token = typeof b.token === "string" ? b.token : "";
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const invite = token ? this.deps.db.getInvite(sha256(token)) : null;
    const now = this.now();
    if (!invite || bearer !== token || invite.used_at !== null || invite.expires_at < now) {
      this.log("pair.rejected");
      return json({ error: "invalid or used invite" }, 401);
    }
    const peerId = typeof b.peerId === "string" ? b.peerId : "";
    const baseUrl = typeof b.baseUrl === "string" ? b.baseUrl : "";
    const ingress = typeof b.ingressSecret === "string" ? b.ingressSecret : "";
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(peerId) || !/^https?:\/\//.test(baseUrl) || ingress.length < 16) {
      return json({ error: "need peerId, baseUrl, ingressSecret" }, 400);
    }
    if (peerId === this.deps.selfId) return json({ error: "cannot pair with yourself" }, 400);
    if (!this.deps.db.useInvite(invite.token_hash, now)) return json({ error: "invalid or used invite" }, 401);
    // The used token must stop working as the pair route's bearer secret.
    await this.deps.secrets.set(FIELDS.pairToken, randomSecret());

    const sharedSecret = randomSecret();
    await this.deps.secrets.set(FIELDS.peer(peerId), sharedSecret);
    await this.deps.secrets.set(FIELDS.peerIngress(peerId), ingress);
    const peer: PeerRow = {
      peer_id: peerId,
      display_name: typeof b.displayName === "string" ? b.displayName.slice(0, 60) : peerId,
      owner_name: typeof b.ownerName === "string" ? b.ownerName.slice(0, 60) : "their owner",
      base_url: baseUrl.replace(/\/+$/, ""),
      status: "active",
      created_at: now,
    };
    this.deps.db.upsertPeer(peer);
    await this.deps.notifier.notify(`You're now connected with ${this.peerLabel(peer)}.`);
    return json({
      peerId: this.deps.selfId,
      displayName: this.deps.selfName,
      ownerName: this.deps.ownerName,
      sharedSecret,
      ingressSecret: await this.ingressSecret(),
    });
  }

  async unpair(peerId: string): Promise<void> {
    const peer = this.deps.db.getPeer(peerId);
    if (!peer) throw new A2AError(`Not connected to ${peerId}.`);
    try {
      await this.sendSigned(peer, "unpair", JSON.stringify({ peerId: this.deps.selfId }));
    } catch (err) {
      this.log("unpair.notify_failed", { peer: peerId, error: String(err) });
    }
    await this.forgetPeer(peerId);
  }

  protected async forgetPeer(peerId: string): Promise<void> {
    await this.deps.secrets.remove(FIELDS.peer(peerId));
    await this.deps.secrets.remove(FIELDS.peerIngress(peerId));
    this.deps.db.deletePeer(peerId);
  }

  // ── Signed transport ───────────────────────────────────────────────────

  protected async sendSigned(peer: PeerRow, path: string, body: string): Promise<PeerResponse> {
    if (peer.status !== "active") throw new A2AError(`${this.peerLabel(peer)} is paused.`);
    const shared = await this.deps.secrets.get(FIELDS.peer(peer.peer_id));
    const ingress = await this.deps.secrets.get(FIELDS.peerIngress(peer.peer_id));
    if (!shared || !ingress) throw new A2AError(`Missing secrets for ${peer.peer_id}; pair again.`);
    return postWithRetry(
      this.deps.transport,
      `${peer.base_url}/${path}`,
      () => ({ headers: signedHeaders({ selfId: this.deps.selfId, sharedSecret: shared, peerIngressSecret: ingress, rawBody: body, nowMs: this.now() }), body }),
      this.deps.sleep,
    );
  }

  /** Per-peer check for every signed route. Pauses a peer after repeated failures. */
  protected async verify(req: Request): Promise<{ ok: true; peer: PeerRow; raw: string } | { ok: false; res: Response }> {
    const raw = await req.text();
    const v = await verifyPeerRequest({
      headers: req.headers,
      rawBody: raw,
      nowMs: this.now(),
      sharedSecretFor: (id) => this.deps.secrets.get(FIELDS.peer(id)),
      nonces: this.nonces,
      limiter: this.limiter,
    });
    if (!v.ok) {
      this.log("auth.rejected", { reason: v.reason, peer: v.peerId });
      if (v.peerId && v.status === 401) {
        const n = this.deps.db.recordAuthFailure(v.peerId, this.now(), FAILURE_WINDOW_MS);
        const peer = this.deps.db.getPeer(v.peerId);
        if (n >= FAILURES_BEFORE_PAUSE && peer && peer.status === "active") {
          this.deps.db.setPeerStatus(v.peerId, "paused");
          await this.deps.notifier.notify(
            `I paused the connection with ${this.peerLabel(peer)} after ${n} failed security checks in 10 minutes. Say "resume ${peer.peer_id}" if this was expected.`,
          );
        }
      }
      return { ok: false, res: json({ error: "unauthorized" }, v.status) };
    }
    const peer = this.deps.db.getPeer(v.peerId);
    if (!peer) return { ok: false, res: json({ error: "unauthorized" }, 401) };
    if (peer.status !== "active") return { ok: false, res: json({ error: "paused" }, 403) };
    return { ok: true, peer, raw };
  }

  resumePeer(peerId: string): void {
    if (!this.deps.db.getPeer(peerId)) throw new A2AError(`Not connected to ${peerId}.`);
    this.deps.db.setPeerStatus(peerId, "active");
  }

  async handleUnpair(req: Request): Promise<Response> {
    const v = await this.verify(req);
    if (!v.ok) return v.res;
    await this.forgetPeer(v.peer.peer_id);
    await this.deps.notifier.notify(`${this.peerLabel(v.peer)} disconnected from me.`);
    return json({ ok: true });
  }

  // ── Notes and tasks: sending ───────────────────────────────────────────

  protected requirePeer(peerId: string): PeerRow {
    const peer = this.deps.db.getPeer(peerId);
    if (!peer) throw new A2AError(`I'm not connected to "${peerId}". Pair first with a2a_create_invite / a2a_redeem_invite.`);
    return peer;
  }

  protected newMessage(peer: PeerRow, text: string, meta: DelegationMeta | null, taskId?: string): A2AMessage {
    return {
      message_id: `msg_${randomUUID()}`,
      context_id: `ctx_${this.deps.selfId}_${peer.peer_id}`,
      ...(taskId ? { task_id: taskId } : {}),
      role: "user",
      parts: [{ kind: "text", text }],
      ...(meta ? { metadata: { [DELEGATION_KEY]: meta } } : {}),
    };
  }

  /** Gate 0 is checked by the calling tool. Sends a note for the peer's owner. */
  async sendNote(peerId: string, text: string): Promise<A2ATask> {
    const peer = this.requirePeer(peerId);
    const meta: DelegationMeta = {
      taskType: "note",
      requester: { assistant: this.deps.selfName, owner: this.deps.ownerName },
      assignee: { owner: peer.owner_name },
    };
    return this.sendNew(peer, text, meta, text.slice(0, 200));
  }

  protected async sendNew(peer: PeerRow, text: string, meta: DelegationMeta, summary: string): Promise<A2ATask> {
    const message = this.newMessage(peer, text, meta);
    const body = JSON.stringify(buildMessageRequest(message, `req_${randomUUID()}`));
    const res = await this.sendSigned(peer, "message", body);
    if (res.status !== 200) throw new A2AError(`${this.peerLabel(peer)} refused the message (HTTP ${res.status}).`);
    const task = (JSON.parse(res.body) as { result?: A2ATask }).result;
    if (!task?.id) throw new A2AError("The other assistant sent no task id.");
    const now = this.now();
    this.deps.db.insertOutbound({
      task_id: task.id,
      peer_id: peer.peer_id,
      context_id: message.context_id!,
      message_id: message.message_id,
      task_type: meta.taskType,
      summary,
      due_by: meta.dueBy ?? null,
      state: task.status.state,
      waiting_on: null,
      last_status_text: null,
      result_files_json: null,
      deadline_notified_at: null,
      created_at: now,
      last_push_at: null,
    });
    return task;
  }

  // ── Notes and tasks: receiving ─────────────────────────────────────────

  async handleMessage(req: Request): Promise<Response> {
    const v = await this.verify(req);
    if (!v.ok) return v.res;
    const parsed = parseMessageRequest(v.raw);
    if (!parsed.ok) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: parsed.error } }, 400);
    const { message } = parsed;
    const now = this.now();
    // Same message id within 24 h: answer as before, do nothing again.
    const seen = this.deps.db.getSeen(v.peer.peer_id, message.message_id, now);
    if (seen) return new Response(seen, { headers: { "content-type": "application/json" } });

    const result = await this.onMessage(v.peer, message);
    if ("error" in result) {
      return json({ jsonrpc: "2.0", id: parsed.id, error: { code: -32602, message: result.error } }, 400);
    }
    const responseJson = JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: result.task });
    this.deps.db.putSeen(v.peer.peer_id, message.message_id, responseJson, now);
    return new Response(responseJson, { headers: { "content-type": "application/json" } });
  }

  /** New note or task from a peer. Phase 7 extends this for tasks and follow-ups. */
  protected async onMessage(peer: PeerRow, message: A2AMessage): Promise<{ task: A2ATask } | { error: string }> {
    const meta = delegationMeta(message);
    if (!meta) return { error: "missing or invalid bunty.delegation/v1 metadata" };
    if (meta.taskType !== "note") return { error: "tasks are not supported by this assistant yet" };
    return { task: await this.receiveNote(peer, message) };
  }

  protected async receiveNote(peer: PeerRow, message: A2AMessage): Promise<A2ATask> {
    const now = this.now();
    const taskId = `task_${randomUUID()}`;
    const text = textOf(message.parts);
    this.deps.db.insertInbound({
      task_id: taskId,
      peer_id: peer.peer_id,
      context_id: message.context_id ?? "",
      message_id: message.message_id,
      task_type: "note",
      text,
      meta_json: JSON.stringify(message.metadata?.[DELEGATION_KEY] ?? {}),
      state: "completed",
      waiting_on: null,
      question: null,
      approved_release_hash: null,
      due_by: null,
      created_at: now,
      updated_at: now,
    });
    await this.deps.notifier.notify(
      `${quotePeer(this.peerLabel(peer), text)}\nTell the owner this note from ${peer.owner_name}. They can reply with a2a_send_note to "${peer.peer_id}".`,
    );
    return { id: taskId, context_id: message.context_id, status: { state: "completed", timestamp: new Date(now).toISOString() } };
  }

  // ── Read-only views for the owner ──────────────────────────────────────

  listPeers(): PeerRow[] {
    return this.deps.db.listPeers();
  }
}
