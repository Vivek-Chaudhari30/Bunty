// Plugin storage: SQLite (bun:sqlite) in the plugin's data dir. No secrets here.
import { Database } from "bun:sqlite";
import { REPLAY_SCHEMA } from "./signing.ts";
import type { TaskState, TaskType, WaitingOn } from "./types.ts";

export type PeerStatus = "active" | "paused";

export interface PeerRow {
  peer_id: string;
  display_name: string;
  owner_name: string;
  base_url: string;
  status: PeerStatus;
  created_at: number;
}

export interface InviteRow {
  token_hash: string;
  expires_at: number;
  used_at: number | null;
  created_at: number;
}

/** A task we received (we are the assignee). */
export interface InboundTask {
  task_id: string;
  peer_id: string;
  context_id: string;
  message_id: string;
  task_type: TaskType;
  text: string;
  meta_json: string;
  state: TaskState;
  waiting_on: WaitingOn | null;
  question: string | null;
  approved_release_hash: string | null;
  due_by: string | null;
  created_at: number;
  updated_at: number;
}

/** A task we sent (we are the requester). */
export interface OutboundTask {
  task_id: string;
  peer_id: string;
  context_id: string;
  message_id: string;
  task_type: TaskType;
  summary: string;
  due_by: string | null;
  state: TaskState;
  waiting_on: WaitingOn | null;
  last_status_text: string | null;
  result_files_json: string | null;
  deadline_notified_at: number | null;
  created_at: number;
  last_push_at: number | null;
}

export class A2ADb {
  readonly db: Database;
  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS peers (
        peer_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, owner_name TEXT NOT NULL,
        base_url TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invites (
        token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seen_messages (
        peer_id TEXT NOT NULL, message_id TEXT NOT NULL, response_json TEXT NOT NULL, seen_at INTEGER NOT NULL,
        PRIMARY KEY (peer_id, message_id)
      );
      CREATE TABLE IF NOT EXISTS delegations_inbound (
        task_id TEXT PRIMARY KEY, peer_id TEXT NOT NULL, context_id TEXT NOT NULL, message_id TEXT NOT NULL,
        task_type TEXT NOT NULL, text TEXT NOT NULL, meta_json TEXT NOT NULL, state TEXT NOT NULL,
        waiting_on TEXT, question TEXT, approved_release_hash TEXT, due_by TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS delegations_outbound (
        task_id TEXT PRIMARY KEY, peer_id TEXT NOT NULL, context_id TEXT NOT NULL, message_id TEXT NOT NULL,
        task_type TEXT NOT NULL, summary TEXT NOT NULL, due_by TEXT, state TEXT NOT NULL, waiting_on TEXT,
        last_status_text TEXT, result_files_json TEXT, deadline_notified_at INTEGER,
        created_at INTEGER NOT NULL, last_push_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS audit (
        at INTEGER NOT NULL, action TEXT NOT NULL, peer_id TEXT NOT NULL, detail TEXT
      );
      CREATE TABLE IF NOT EXISTS auth_failures (peer_id TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS shared_files (
        file_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, peer_id TEXT NOT NULL, path TEXT NOT NULL,
        filename TEXT NOT NULL, media_type TEXT, expires_at INTEGER NOT NULL
      );
    `);
    this.db.exec(REPLAY_SCHEMA);
  }

  getSetting(key: string): string | null {
    return (this.db.query("SELECT value FROM settings WHERE key = ?1").get(key) as { value: string } | null)?.value ?? null;
  }
  setSetting(key: string, value: string): void {
    this.db.query("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2").run(key, value);
  }

  upsertPeer(p: PeerRow): void {
    this.db
      .query(
        `INSERT INTO peers (peer_id, display_name, owner_name, base_url, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(peer_id) DO UPDATE SET display_name = ?2, owner_name = ?3, base_url = ?4, status = ?5`,
      )
      .run(p.peer_id, p.display_name, p.owner_name, p.base_url, p.status, p.created_at);
  }
  getPeer(peerId: string): PeerRow | null {
    return (this.db.query("SELECT * FROM peers WHERE peer_id = ?1").get(peerId) as PeerRow | null) ?? null;
  }
  listPeers(): PeerRow[] {
    return this.db.query("SELECT * FROM peers ORDER BY created_at").all() as PeerRow[];
  }
  setPeerStatus(peerId: string, status: PeerStatus): void {
    this.db.query("UPDATE peers SET status = ?2 WHERE peer_id = ?1").run(peerId, status);
  }
  deletePeer(peerId: string): void {
    this.db.query("DELETE FROM peers WHERE peer_id = ?1").run(peerId);
  }

  addInvite(i: InviteRow): void {
    this.db.query("INSERT INTO invites (token_hash, expires_at, used_at, created_at) VALUES (?1, ?2, ?3, ?4)").run(i.token_hash, i.expires_at, i.used_at, i.created_at);
  }
  getInvite(hash: string): InviteRow | null {
    return (this.db.query("SELECT * FROM invites WHERE token_hash = ?1").get(hash) as InviteRow | null) ?? null;
  }
  useInvite(hash: string, now: number): boolean {
    return this.db.query("UPDATE invites SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL").run(hash, now).changes === 1;
  }

  getSeen(peerId: string, messageId: string, now: number): string | null {
    this.db.query("DELETE FROM seen_messages WHERE seen_at < ?1").run(now - 24 * 60 * 60 * 1000);
    return (
      (this.db.query("SELECT response_json FROM seen_messages WHERE peer_id = ?1 AND message_id = ?2").get(peerId, messageId) as {
        response_json: string;
      } | null)?.response_json ?? null
    );
  }
  putSeen(peerId: string, messageId: string, responseJson: string, now: number): void {
    this.db.query("INSERT OR REPLACE INTO seen_messages (peer_id, message_id, response_json, seen_at) VALUES (?1, ?2, ?3, ?4)").run(peerId, messageId, responseJson, now);
  }

  insertInbound(t: InboundTask): void {
    this.db
      .query(
        `INSERT INTO delegations_inbound (task_id, peer_id, context_id, message_id, task_type, text, meta_json, state, waiting_on,
          question, approved_release_hash, due_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      )
      .run(t.task_id, t.peer_id, t.context_id, t.message_id, t.task_type, t.text, t.meta_json, t.state, t.waiting_on, t.question, t.approved_release_hash, t.due_by, t.created_at, t.updated_at);
  }
  getInbound(taskId: string): InboundTask | null {
    return (this.db.query("SELECT * FROM delegations_inbound WHERE task_id = ?1").get(taskId) as InboundTask | null) ?? null;
  }
  updateInbound(taskId: string, fields: Partial<Pick<InboundTask, "state" | "waiting_on" | "question" | "approved_release_hash">>, now: number): void {
    const cur = this.getInbound(taskId);
    if (!cur) return;
    const next = { ...cur, ...fields };
    this.db
      .query("UPDATE delegations_inbound SET state = ?2, waiting_on = ?3, question = ?4, approved_release_hash = ?5, updated_at = ?6 WHERE task_id = ?1")
      .run(taskId, next.state, next.waiting_on, next.question, next.approved_release_hash, now);
  }
  listInbound(): InboundTask[] {
    return this.db.query("SELECT * FROM delegations_inbound ORDER BY created_at DESC").all() as InboundTask[];
  }

  insertOutbound(t: OutboundTask): void {
    this.db
      .query(
        `INSERT INTO delegations_outbound (task_id, peer_id, context_id, message_id, task_type, summary, due_by, state, waiting_on,
          last_status_text, result_files_json, deadline_notified_at, created_at, last_push_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      )
      .run(t.task_id, t.peer_id, t.context_id, t.message_id, t.task_type, t.summary, t.due_by, t.state, t.waiting_on, t.last_status_text, t.result_files_json, t.deadline_notified_at, t.created_at, t.last_push_at);
  }
  getOutbound(taskId: string): OutboundTask | null {
    return (this.db.query("SELECT * FROM delegations_outbound WHERE task_id = ?1").get(taskId) as OutboundTask | null) ?? null;
  }
  updateOutbound(
    taskId: string,
    fields: Partial<Pick<OutboundTask, "state" | "waiting_on" | "last_status_text" | "result_files_json" | "deadline_notified_at" | "last_push_at">>,
  ): void {
    const cur = this.getOutbound(taskId);
    if (!cur) return;
    const n = { ...cur, ...fields };
    this.db
      .query(
        "UPDATE delegations_outbound SET state = ?2, waiting_on = ?3, last_status_text = ?4, result_files_json = ?5, deadline_notified_at = ?6, last_push_at = ?7 WHERE task_id = ?1",
      )
      .run(taskId, n.state, n.waiting_on, n.last_status_text, n.result_files_json, n.deadline_notified_at, n.last_push_at);
  }
  listOutbound(): OutboundTask[] {
    return this.db.query("SELECT * FROM delegations_outbound ORDER BY created_at DESC").all() as OutboundTask[];
  }

  /** Records a failed auth and returns how many failures this peer had in the window. */
  recordAuthFailure(peerId: string, now: number, windowMs: number): number {
    this.db.query("DELETE FROM auth_failures WHERE at < ?1").run(now - windowMs);
    this.db.query("INSERT INTO auth_failures (peer_id, at) VALUES (?1, ?2)").run(peerId, now);
    return (this.db.query("SELECT COUNT(*) AS n FROM auth_failures WHERE peer_id = ?1").get(peerId) as { n: number }).n;
  }

  addSharedFile(f: { file_id: string; task_id: string; peer_id: string; path: string; filename: string; media_type: string | null; expires_at: number }): void {
    this.db
      .query("INSERT INTO shared_files (file_id, task_id, peer_id, path, filename, media_type, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .run(f.file_id, f.task_id, f.peer_id, f.path, f.filename, f.media_type, f.expires_at);
  }
  getSharedFile(fileId: string): { file_id: string; task_id: string; peer_id: string; path: string; filename: string; media_type: string | null; expires_at: number } | null {
    return (this.db.query("SELECT * FROM shared_files WHERE file_id = ?1").get(fileId) as never) ?? null;
  }

  /** Every request we send to another assistant. No message text, only what and to whom. */
  audit(action: string, peerId: string, detail: string | null, now: number): void {
    this.db.query("INSERT INTO audit (at, action, peer_id, detail) VALUES (?1, ?2, ?3, ?4)").run(now, action, peerId, detail);
  }
  listAudit(limit = 100): Array<{ at: number; action: string; peer_id: string; detail: string | null }> {
    return this.db.query("SELECT * FROM audit ORDER BY at DESC LIMIT ?1").all(limit) as Array<{
      at: number;
      action: string;
      peer_id: string;
      detail: string | null;
    }>;
  }

  /** "Delete my data": everything this plugin stored. */
  wipe(): void {
    for (const t of ["settings", "peers", "invites", "seen_messages", "delegations_inbound", "delegations_outbound", "auth_failures", "shared_files", "audit", "nonces", "rate_hits"]) {
      this.db.exec(`DELETE FROM ${t}`);
    }
  }
}
