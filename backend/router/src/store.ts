// SQLite storage for the router (bun:sqlite). No message bodies are stored.
import { Database } from "bun:sqlite";
import { RATE_HITS_SCHEMA } from "./limits.ts";

export const STICKY_TTL_MS = 24 * 60 * 60 * 1000;

export interface UserRow {
  phone_e164: string;
  assistant_id: string;
  assistant_base_url: string;
  status: "active" | "paused";
  created_at: number;
}

export type ConsentKind = "recording" | "data_use";

export class RouterStore {
  readonly db: Database;

  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        phone_e164 TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        assistant_base_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS users_assistant ON users(assistant_id);
      CREATE TABLE IF NOT EXISTS sticky_routes (
        counterparty_e164 TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS consent (
        phone_e164 TEXT NOT NULL,
        kind TEXT NOT NULL,
        granted_at INTEGER NOT NULL,
        PRIMARY KEY (phone_e164, kind)
      );
      CREATE TABLE IF NOT EXISTS onboarding_replies (
        phone_e164 TEXT PRIMARY KEY,
        sent_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (
        at INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_last4 TEXT NOT NULL,
        assistant_id TEXT
      );
    `);
    this.db.exec(RATE_HITS_SCHEMA);
  }

  /** Outward actions the router itself takes (onboarding replies, deletes). Last 4 digits only. */
  audit(action: string, targetE164: string, assistantId: string | null = null, now = Date.now()): void {
    this.db
      .query("INSERT INTO audit (at, action, target_last4, assistant_id) VALUES (?1, ?2, ?3, ?4)")
      .run(now, action, targetE164.slice(-4), assistantId);
  }

  listAudit(limit = 100): Array<{ at: number; action: string; target_last4: string; assistant_id: string | null }> {
    return this.db.query("SELECT * FROM audit ORDER BY at DESC LIMIT ?1").all(limit) as Array<{
      at: number;
      action: string;
      target_last4: string;
      assistant_id: string | null;
    }>;
  }

  /**
   * "Delete my data": the user's routing row, consent, onboarding record, rate-limit hits, and every sticky
   * route that points at their assistant or their number. Returns the removed assistant id,
   * so the operator can delete that assistant's workspace too.
   */
  deleteUser(phone: string): string | null {
    const user = this.getUser(phone);
    this.db.transaction(() => {
      if (user) this.db.query("DELETE FROM sticky_routes WHERE assistant_id = ?1").run(user.assistant_id);
      this.db.query("DELETE FROM sticky_routes WHERE counterparty_e164 = ?1").run(phone);
      this.db.query("DELETE FROM users WHERE phone_e164 = ?1").run(phone);
      this.db.query("DELETE FROM consent WHERE phone_e164 = ?1").run(phone);
      this.db.query("DELETE FROM onboarding_replies WHERE phone_e164 = ?1").run(phone);
      this.db.query("DELETE FROM rate_hits WHERE key = ?1").run(phone);
    })();
    return user?.assistant_id ?? null;
  }

  upsertUser(u: Omit<UserRow, "created_at" | "status"> & { status?: UserRow["status"] }, now = Date.now()): void {
    this.db
      .query(
        `INSERT INTO users (phone_e164, assistant_id, assistant_base_url, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(phone_e164) DO UPDATE SET assistant_id = ?2, assistant_base_url = ?3, status = ?4`,
      )
      .run(u.phone_e164, u.assistant_id, u.assistant_base_url.replace(/\/+$/, ""), u.status ?? "active", now);
  }

  getUser(phone: string): UserRow | null {
    return (this.db.query("SELECT * FROM users WHERE phone_e164 = ?1").get(phone) as UserRow | null) ?? null;
  }

  getAssistant(assistantId: string): UserRow | null {
    return (
      (this.db.query("SELECT * FROM users WHERE assistant_id = ?1 LIMIT 1").get(assistantId) as UserRow | null) ?? null
    );
  }

  /** "I just messaged or called this non-user": route their replies back for 24 h. */
  setSticky(counterparty: string, assistantId: string, now = Date.now()): void {
    this.db
      .query(
        `INSERT INTO sticky_routes (counterparty_e164, assistant_id, expires_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(counterparty_e164) DO UPDATE SET assistant_id = ?2, expires_at = ?3`,
      )
      .run(counterparty, assistantId, now + STICKY_TTL_MS);
  }

  getSticky(counterparty: string, now = Date.now()): string | null {
    const row = this.db
      .query("SELECT assistant_id FROM sticky_routes WHERE counterparty_e164 = ?1 AND expires_at > ?2")
      .get(counterparty, now) as { assistant_id: string } | null;
    return row?.assistant_id ?? null;
  }

  pruneExpired(now = Date.now()): number {
    return this.db.query("DELETE FROM sticky_routes WHERE expires_at <= ?1").run(now).changes;
  }

  recordConsent(phone: string, kind: ConsentKind, now = Date.now()): void {
    this.db
      .query(
        `INSERT INTO consent (phone_e164, kind, granted_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(phone_e164, kind) DO UPDATE SET granted_at = ?3`,
      )
      .run(phone, kind, now);
  }

  getConsent(phone: string): Array<{ kind: ConsentKind; granted_at: number }> {
    return this.db.query("SELECT kind, granted_at FROM consent WHERE phone_e164 = ?1").all(phone) as Array<{
      kind: ConsentKind;
      granted_at: number;
    }>;
  }

  /** True if we may send this unknown number an onboarding reply (once per 24 h). */
  claimOnboardingReply(phone: string, now = Date.now()): boolean {
    const row = this.db.query("SELECT sent_at FROM onboarding_replies WHERE phone_e164 = ?1").get(phone) as {
      sent_at: number;
    } | null;
    if (row && now - row.sent_at < STICKY_TTL_MS) return false;
    this.db
      .query(
        `INSERT INTO onboarding_replies (phone_e164, sent_at) VALUES (?1, ?2)
         ON CONFLICT(phone_e164) DO UPDATE SET sent_at = ?2`,
      )
      .run(phone, now);
    return true;
  }
}
