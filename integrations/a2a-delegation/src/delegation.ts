// Delegated tasks with owner gates (protocol sections 4 to 9).
//
// Requester (Chintu): sendTask, answerQuestion, cancelTask, handleStatus, deadlineSweep.
// Assignee (Sujal): receive task -> Gate A (acceptDelegation) -> work (Gate B is Vellum's own
// gating of Sujal's tools) -> askRequester -> Gate C (releaseResult) -> completed.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { InboundTask, OutboundTask, PeerRow } from "./db.ts";
import { buildMessageRequest, delegationMeta, quotePeer, textOf, validateTask } from "./envelope.ts";
import {
  checkFileUrl,
  FILE_URL_TTL_MS,
  hashResultFiles,
  INLINE_MAX_BYTES,
  inlinePart,
  manifestHash,
  mediaTypeFor,
  safeFilename,
  saveReceived,
  sha256Hex,
  signFileUrl,
  WorkspaceFiles,
  type ResultFile,
} from "./files.ts";
import { FIELDS } from "./secrets.ts";
import { A2AError, A2AService, type ServiceDeps } from "./service.ts";
import { signedHeaders } from "./signing.ts";
import { assertMove, isTerminal } from "./state.ts";
import {
  DELEGATION_KEY,
  WAITING_ON_KEY,
  type A2AMessage,
  type A2ATask,
  type Artifact,
  type Deliverable,
  type DelegationMeta,
  type FilePart,
  type Part,
  type TaskState,
  type WaitingOn,
} from "./types.ts";

export interface DelegationDeps extends ServiceDeps {
  /** Plugin data dir: received files are saved under it. */
  dataDir?: string;
  /** Where approved result files are read from (the assistant's workspace). */
  files?: WorkspaceFiles;
}

/** States the requester's owner hears about (decision D-06). */
const OWNER_HEARS: ReadonlySet<TaskState> = new Set(["working", "input_required", "completed", "rejected", "failed", "canceled"]);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export class DelegationService extends A2AService {
  constructor(override readonly deps: DelegationDeps) {
    super(deps);
  }

  // ── Requester side ─────────────────────────────────────────────────────

  /** Gate 0 is checked by the calling tool. */
  async sendTask(peerId: string, description: string, deliverables: Deliverable[], dueBy?: string): Promise<A2ATask> {
    const peer = this.requirePeer(peerId);
    if (dueBy !== undefined && Number.isNaN(Date.parse(dueBy))) throw new A2AError("dueBy must be a date and time with a time zone, e.g. 2026-01-02T18:00:00+05:30.");
    const meta: DelegationMeta = {
      taskType: "task",
      requester: { assistant: this.deps.selfName, owner: this.deps.ownerName },
      assignee: { owner: peer.owner_name },
      ...(deliverables.length ? { deliverables } : {}),
      ...(dueBy ? { dueBy } : {}),
      acceptBy: "assignee_owner",
      releaseBy: "assignee_owner",
    };
    return this.sendNew(peer, description, meta, description.slice(0, 200));
  }

  protected requireOutbound(taskId: string): { task: OutboundTask; peer: PeerRow } {
    const task = this.deps.db.getOutbound(taskId);
    if (!task) throw new A2AError(`No task ${taskId} that we sent.`);
    return { task, peer: this.requirePeer(task.peer_id) };
  }

  /** Owner A answers a question from Sujal. Only the owner's words are sent. */
  async answerQuestion(taskId: string, answer: string): Promise<void> {
    const { task, peer } = this.requireOutbound(taskId);
    if (task.state !== "input_required" || task.waiting_on !== "requester") throw new A2AError("That task is not waiting for an answer from us.");
    const message = this.newMessage(peer, answer, null, taskId);
    const res = await this.sendSigned(peer, "message", JSON.stringify(buildMessageRequest(message, `req_${randomUUID()}`)));
    if (res.status !== 200) throw new A2AError(`${this.peerLabel(peer)} did not take the answer (HTTP ${res.status}).`);
    this.deps.db.updateOutbound(taskId, { state: "working", waiting_on: null });
  }

  async cancelTask(taskId: string, reason = ""): Promise<void> {
    const { task, peer } = this.requireOutbound(taskId);
    if (isTerminal(task.state)) throw new A2AError(`That task is already ${task.state}.`);
    const res = await this.sendSigned(peer, "cancel", JSON.stringify({ taskId, reason: reason.slice(0, 500) }));
    if (res.status !== 200) throw new A2AError(`${this.peerLabel(peer)} did not confirm the cancel (HTTP ${res.status}).`);
    this.deps.db.updateOutbound(taskId, { state: "canceled", waiting_on: null });
  }

  async handleStatus(req: Request): Promise<Response> {
    const v = await this.verify(req);
    if (!v.ok) return v.res;
    let body: unknown;
    try {
      body = JSON.parse(v.raw);
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const task = validateTask(body);
    if (!task) return json({ error: "invalid task" }, 400);
    const ours = this.deps.db.getOutbound(task.id);
    if (!ours || ours.peer_id !== v.peer.peer_id) return json({ error: "unknown task" }, 404);
    if (isTerminal(ours.state)) return json({ ok: true, ignored: "task already finished" });

    const state = task.status.state;
    const waitingOn = (task.status.message?.metadata?.[WAITING_ON_KEY] as WaitingOn | undefined) ?? null;
    const statusText = task.status.message ? textOf(task.status.message.parts) : "";
    let savedPaths: string[] = [];
    if (state === "completed" && task.artifacts?.length) {
      try {
        savedPaths = await this.receiveFiles(v.peer, task);
      } catch (err) {
        this.log("status.files_failed", { task: task.id, error: String(err) });
        return json({ error: "could not read the result files" }, 422);
      }
    }
    this.deps.db.updateOutbound(task.id, {
      state,
      waiting_on: state === "input_required" ? waitingOn : null,
      last_status_text: statusText || null,
      last_push_at: this.now(),
      ...(savedPaths.length ? { result_files_json: JSON.stringify(savedPaths) } : {}),
    });

    const wasWorking = ours.state === "working";
    const tellOwner = OWNER_HEARS.has(state) && !(state === "working" && wasWorking) && !(state === "input_required" && waitingOn !== "requester");
    if (tellOwner) await this.deps.notifier.notify(this.requesterUpdate(v.peer, ours, state, statusText, savedPaths));
    return json({ ok: true });
  }

  protected requesterUpdate(peer: PeerRow, t: OutboundTask, state: TaskState, text: string, files: string[]): string {
    const who = peer.owner_name;
    const quoted = text ? `\n${quotePeer(this.peerLabel(peer), text)}` : "";
    switch (state) {
      case "working":
        return `${who} accepted the task "${t.summary}" (${t.task_id}).`;
      case "input_required":
        return `${who}'s assistant has a question about "${t.summary}" (${t.task_id}).${quoted}\nAsk the owner and send their answer with a2a_answer_question.`;
      case "completed":
        return files.length
          ? `${who} sent the results for "${t.summary}" (${t.task_id}): ${files.length} file(s), saved at:\n${files.join("\n")}${quoted}\nGive them to the owner.`
          : `${who} finished "${t.summary}" (${t.task_id}).${quoted}`;
      case "rejected":
        return `${who} declined the task "${t.summary}" (${t.task_id}).${quoted}`;
      case "failed":
        return `${who}'s assistant could not finish "${t.summary}" (${t.task_id}).${quoted}`;
      case "canceled":
        return `${who} stopped the task "${t.summary}" (${t.task_id}).${quoted}`;
      default:
        return `Update on "${t.summary}": ${state}.`;
    }
  }

  /** Decodes inline files and downloads URL files (signed GET), then saves them. */
  protected async receiveFiles(peer: PeerRow, task: A2ATask): Promise<string[]> {
    const files: ResultFile[] = [];
    for (const a of task.artifacts ?? []) {
      for (const p of a.parts) {
        if (p.kind !== "file") continue;
        const filename = safeFilename(p.filename ?? `file-${files.length + 1}`);
        let bytes: Uint8Array;
        if (p.raw !== undefined) {
          bytes = new Uint8Array(Buffer.from(p.raw, "base64"));
        } else {
          const url = new URL(p.url!);
          if (!url.href.startsWith(`${peer.base_url}/file?`)) throw new Error("file url is not on the peer's own file route");
          bytes = await this.download(peer, url.href);
        }
        files.push({ filename, mediaType: p.media_type ?? mediaTypeFor(filename), bytes });
      }
    }
    if (!files.length) return [];
    return saveReceived(this.deps.dataDir ?? ".", task.id, files);
  }

  protected async download(peer: PeerRow, url: string): Promise<Uint8Array> {
    const shared = await this.deps.secrets.get(FIELDS.peer(peer.peer_id));
    const ingress = await this.deps.secrets.get(FIELDS.peerIngress(peer.peer_id));
    if (!shared || !ingress) throw new Error("missing peer secrets");
    const headers = signedHeaders({ selfId: this.deps.selfId, sharedSecret: shared, peerIngressSecret: ingress, rawBody: "", nowMs: this.now() });
    const res = await this.deps.transport.get(url, headers);
    if (res.status !== 200) throw new Error(`download failed: HTTP ${res.status}`);
    return res.bytes;
  }

  /** Requester side, every 15 minutes: tell the owner about tasks past their deadline, once. */
  async deadlineSweep(): Promise<number> {
    const now = this.now();
    let n = 0;
    for (const t of this.deps.db.listOutbound()) {
      if (t.task_type !== "task" || !t.due_by || isTerminal(t.state) || t.deadline_notified_at !== null) continue;
      if (Date.parse(t.due_by) > now) continue;
      const peer = this.deps.db.getPeer(t.peer_id);
      const who = peer?.owner_name ?? t.peer_id;
      await this.deps.notifier.notify(
        `The deadline for "${t.summary}" (${t.task_id}) has passed. Last state: ${t.state}${t.last_status_text ? ` ("${t.last_status_text.slice(0, 200)}")` : ""}. ` +
          `Ask the owner: send ${who} a reminder (a2a_send_note), call ${who} (reach-contact), wait, or cancel (a2a_cancel_task)?`,
      );
      this.deps.db.updateOutbound(t.task_id, { deadline_notified_at: now });
      n++;
    }
    return n;
  }

  // ── Assignee side ──────────────────────────────────────────────────────

  protected override async onMessage(peer: PeerRow, message: A2AMessage): Promise<{ task: A2ATask } | { error: string }> {
    if (message.task_id) return this.onFollowUp(peer, message);
    const meta = delegationMeta(message);
    if (!meta) return { error: "missing or invalid bunty.delegation/v1 metadata" };
    if (meta.taskType === "note") return { task: await this.receiveNote(peer, message) };
    return { task: await this.receiveTask(peer, message, meta) };
  }

  protected toA2A(t: InboundTask, text?: string, artifacts?: Artifact[]): A2ATask {
    const status: A2ATask["status"] = { state: t.state, timestamp: iso(t.updated_at) };
    if (text !== undefined || t.waiting_on) {
      status.message = {
        message_id: `msg_${randomUUID()}`,
        context_id: t.context_id,
        task_id: t.task_id,
        role: "agent",
        parts: [{ kind: "text", text: text ?? "" }],
        ...(t.waiting_on ? { metadata: { [WAITING_ON_KEY]: t.waiting_on } } : {}),
      };
    }
    return { id: t.task_id, context_id: t.context_id, status, ...(artifacts ? { artifacts } : {}) };
  }

  protected async receiveTask(peer: PeerRow, message: A2AMessage, meta: DelegationMeta): Promise<A2ATask> {
    const now = this.now();
    const text = textOf(message.parts);
    const task: InboundTask = {
      task_id: `task_${randomUUID()}`,
      peer_id: peer.peer_id,
      context_id: message.context_id ?? "",
      message_id: message.message_id,
      task_type: "task",
      text,
      meta_json: JSON.stringify(meta),
      state: "submitted",
      waiting_on: null,
      question: null,
      approved_release_hash: null,
      due_by: meta.dueBy ?? null,
      created_at: now,
      updated_at: now,
    };
    this.deps.db.insertInbound(task);
    // Gate A asked: nothing happens until the owner accepts.
    assertMove("submitted", "input_required");
    this.deps.db.updateInbound(task.task_id, { state: "input_required", waiting_on: "assignee_owner_accept" }, now);
    const deliverables = meta.deliverables?.map((d) => `- ${d.title}${d.format ? ` (${d.format})` : ""}`).join("\n");
    await this.deps.notifier.notify(
      `${peer.owner_name} (through ${this.peerLabel(peer)}) is asking ${this.deps.ownerName} to do a task.\n` +
        `${quotePeer(this.peerLabel(peer), text)}\n` +
        (deliverables ? `Deliverables:\n${deliverables}\n` : "") +
        (meta.dueBy ? `Due by: ${meta.dueBy}\n` : "") +
        `Task id: ${task.task_id}. Ask the owner whether to take it. Only their answer counts: accept_delegation with accept true or false.`,
    );
    return this.toA2A(this.deps.db.getInbound(task.task_id)!);
  }

  protected async onFollowUp(peer: PeerRow, message: A2AMessage): Promise<{ task: A2ATask } | { error: string }> {
    const t = this.deps.db.getInbound(message.task_id!);
    if (!t || t.peer_id !== peer.peer_id) return { error: "unknown task" };
    const text = textOf(message.parts);
    if (t.state === "input_required" && t.waiting_on === "requester") {
      this.deps.db.updateInbound(t.task_id, { state: "working", waiting_on: null }, this.now());
      await this.deps.notifier.notify(
        `${peer.owner_name} answered your question on task ${t.task_id} ("${t.question ?? ""}"):\n${quotePeer(this.peerLabel(peer), text)}\nCarry on with the task.`,
      );
    } else {
      await this.deps.notifier.notify(`More from ${peer.owner_name} about task ${t.task_id}:\n${quotePeer(this.peerLabel(peer), text)}`);
    }
    return { task: this.toA2A(this.deps.db.getInbound(t.task_id)!) };
  }

  protected requireInbound(taskId: string): { task: InboundTask; peer: PeerRow } {
    const task = this.deps.db.getInbound(taskId);
    if (!task || task.task_type !== "task") throw new A2AError(`No task ${taskId} that we received.`);
    return { task, peer: this.requirePeer(task.peer_id) };
  }

  /** Pushes a status to the requester. Refuses any file that the owner did not release (Gate C). */
  protected async pushStatus(t: InboundTask, a2a: A2ATask): Promise<void> {
    const fileParts = (a2a.artifacts ?? []).flatMap((a) => a.parts).filter((p): p is FilePart => p.kind === "file");
    if (fileParts.length) {
      const manifest = manifestHash(
        fileParts.map((p) => {
          const meta = (p as FilePart & { sha256?: string }).sha256;
          return { filename: p.filename ?? "", sha256: p.raw !== undefined ? sha256Hex(new Uint8Array(Buffer.from(p.raw, "base64"))) : meta ?? "" };
        }),
      );
      if (!t.approved_release_hash || t.approved_release_hash !== manifest || a2a.status.state !== "completed") {
        throw new A2AError("Refusing to send files the owner did not approve (Gate C).");
      }
    }
    const peer = this.requirePeer(t.peer_id);
    const res = await this.sendSigned(peer, "status", JSON.stringify(a2a));
    if (res.status !== 200) throw new A2AError(`${this.peerLabel(peer)} did not take the update (HTTP ${res.status}).`);
  }

  protected move(t: InboundTask, to: TaskState, fields: { waiting_on?: WaitingOn | null; question?: string | null; approved_release_hash?: string | null } = {}): InboundTask {
    assertMove(t.state, to);
    this.deps.db.updateInbound(t.task_id, { state: to, waiting_on: fields.waiting_on ?? null, ...fields }, this.now());
    return this.deps.db.getInbound(t.task_id)!;
  }

  /** Gate A. The calling tool has checked owner + fresh approval. */
  async acceptDelegation(taskId: string, accept: boolean, reason = ""): Promise<InboundTask> {
    const { task } = this.requireInbound(taskId);
    if (task.state !== "input_required" || task.waiting_on !== "assignee_owner_accept") {
      throw new A2AError(`Task ${taskId} is not waiting for the owner's decision (it is ${task.state}).`);
    }
    const next = this.move(task, accept ? "working" : "rejected");
    await this.pushStatus(next, this.toA2A(next, accept ? "Accepted." : reason ? `Declined: ${reason}` : "Declined."));
    return next;
  }

  /** Sujal needs something from the requester (for example, which template to use). */
  async askRequester(taskId: string, question: string): Promise<void> {
    const { task } = this.requireInbound(taskId);
    if (task.state !== "working") throw new A2AError(`Task ${taskId} is ${task.state}; questions only while working.`);
    const next = this.move(task, "input_required", { waiting_on: "requester", question: question.slice(0, 2000) });
    await this.pushStatus(next, this.toA2A(next, question));
  }

  /**
   * Gate C. Sends exactly the files the owner approved in this call. The hash is stored
   * first; pushStatus refuses any file set that does not match it.
   */
  async releaseResult(taskId: string, paths: string[], note = ""): Promise<{ files: number; hash: string }> {
    const { task, peer } = this.requireInbound(taskId);
    const releasable = task.state === "working" || (task.state === "input_required" && task.waiting_on === "assignee_owner_release");
    if (!releasable) throw new A2AError(`Task ${taskId} is ${task.state}; nothing to release.`);
    if (!this.deps.files) throw new A2AError("File access is not set up for this assistant.");
    if (!paths.length) throw new A2AError("Name the files to send.");
    const files = paths.map((p) => this.deps.files!.read(p));
    const hash = hashResultFiles(files);
    // Gate C asked and answered in the same owner action: working -> input_required -> completed.
    const asked = task.state === "working" ? this.move(task, "input_required", { waiting_on: "assignee_owner_release" }) : task;
    const approved = this.move(asked, "completed", { approved_release_hash: hash });

    const parts: Part[] = [];
    for (const f of files) {
      if (f.bytes.byteLength <= INLINE_MAX_BYTES) {
        parts.push(inlinePart(f));
      } else {
        parts.push(await this.shareLargeFile(peer, task.task_id, f));
      }
    }
    const artifacts: Artifact[] = parts.length ? [{ artifact_id: `art_${randomUUID()}`, parts }] : [];
    try {
      await this.pushStatus(approved, this.toA2A(approved, note || "Here are the results.", artifacts));
    } catch (err) {
      // Not delivered: go back so the owner can try again; the approval stays tied to these files.
      this.deps.db.updateInbound(task.task_id, { state: "input_required", waiting_on: "assignee_owner_release", approved_release_hash: hash }, this.now());
      throw err;
    }
    return { files: files.length, hash };
  }

  /** Files over 5 MB: a signed link valid 24 h, served by GET file. */
  protected async shareLargeFile(peer: PeerRow, taskId: string, f: ResultFile): Promise<FilePart> {
    const shared = await this.deps.secrets.get(FIELDS.peer(peer.peer_id));
    if (!shared || !this.deps.dataDir) throw new A2AError("Cannot share a large file: missing secret or data dir.");
    const fileId = `file_${randomUUID()}`;
    const dir = join(this.deps.dataDir, "outbox");
    const [path] = saveReceived(dir, taskId, [f]);
    const exp = this.now() + FILE_URL_TTL_MS;
    this.deps.db.addSharedFile({ file_id: fileId, task_id: taskId, peer_id: peer.peer_id, path: path!, filename: f.filename, media_type: f.mediaType, expires_at: exp });
    const url = `${await this.deps.selfBaseUrl()}/file?id=${fileId}&exp=${exp}&sig=${signFileUrl(shared, fileId, exp)}`;
    return Object.assign({ kind: "file" as const, filename: f.filename, media_type: f.mediaType, url }, { sha256: sha256Hex(f.bytes) });
  }

  async reportFailure(taskId: string, reason: string): Promise<void> {
    const { task } = this.requireInbound(taskId);
    const next = this.move(task, task.state === "submitted" || task.state === "input_required" ? "canceled" : "failed");
    await this.pushStatus(next, this.toA2A(next, reason.slice(0, 2000)));
  }

  async handleCancel(req: Request): Promise<Response> {
    const v = await this.verify(req);
    if (!v.ok) return v.res;
    let taskId = "";
    let reason = "";
    try {
      const b = JSON.parse(v.raw) as { taskId?: unknown; reason?: unknown };
      taskId = typeof b.taskId === "string" ? b.taskId : "";
      reason = typeof b.reason === "string" ? b.reason : "";
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const t = this.deps.db.getInbound(taskId);
    if (!t || t.peer_id !== v.peer.peer_id) return json({ error: "unknown task" }, 404);
    if (isTerminal(t.state)) return json({ ok: true, state: t.state });
    this.move(t, "canceled");
    await this.deps.notifier.notify(
      `${v.peer.owner_name} canceled the task ${taskId}. Stop any work on it.${reason ? `\n${quotePeer(this.peerLabel(v.peer), reason)}` : ""}`,
    );
    return json({ ok: true, state: "canceled" });
  }

  async handleFile(req: Request): Promise<Response> {
    const v = await this.verify(req);
    if (!v.ok) return v.res;
    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? "";
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig") ?? "";
    const f = this.deps.db.getSharedFile(id);
    const shared = await this.deps.secrets.get(FIELDS.peer(v.peer.peer_id));
    if (!f || f.peer_id !== v.peer.peer_id || !shared || f.expires_at !== exp || !checkFileUrl(shared, id, exp, sig, this.now())) {
      return json({ error: "not found" }, 404);
    }
    return new Response(Bun.file(f.path), { headers: { "content-type": f.media_type ?? "application/octet-stream" } });
  }
}
