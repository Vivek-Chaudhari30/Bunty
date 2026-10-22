// Per-number rate limits and simple counters for /metrics.
import { Database } from "bun:sqlite";

/** Hits in the last minute, per limiter ("bucket") and sender. Created by RouterStore. */
export const RATE_HITS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS rate_hits (
    bucket TEXT NOT NULL,
    key TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS rate_hits_key ON rate_hits(bucket, key, at);
  CREATE INDEX IF NOT EXISTS rate_hits_at ON rate_hits(at);
`;

/**
 * Sliding one-minute window per key, kept in SQLite so limits survive a router restart.
 * Pass the router's database (`store.db`); without one it uses a private in-memory database.
 * Rows older than a minute are deleted on every check.
 */
export class RateLimiter {
  private readonly db: Database;
  constructor(
    readonly perMinute: number,
    db?: Database,
    private readonly bucket = "default",
  ) {
    if (db) {
      this.db = db;
    } else {
      this.db = new Database(":memory:");
      this.db.exec(RATE_HITS_SCHEMA);
    }
  }
  allow(key: string, nowMs: number): boolean {
    return this.db.transaction(() => {
      this.db.query("DELETE FROM rate_hits WHERE at <= ?1").run(nowMs - 60_000);
      const { n } = this.db
        .query("SELECT COUNT(*) AS n FROM rate_hits WHERE bucket = ?1 AND key = ?2")
        .get(this.bucket, key) as { n: number };
      const ok = n < this.perMinute;
      if (ok) this.db.query("INSERT INTO rate_hits (bucket, key, at) VALUES (?1, ?2, ?3)").run(this.bucket, key, nowMs);
      return ok;
    })();
  }
}

/** WhatsApp messages and calls allowed per sender number per minute. */
export const WHATSAPP_PER_MINUTE = 30;
export const CALLS_PER_MINUTE = 5;

export class Metrics {
  private counts = new Map<string, number>();
  inc(name: string, by = 1): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + by);
  }
  get(name: string): number {
    return this.counts.get(name) ?? 0;
  }
  /** Prometheus text format. Counters only, no numbers or message content. */
  render(): string {
    return [...this.counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `# TYPE bunty_router_${k} counter\nbunty_router_${k} ${v}`)
      .join("\n") + "\n";
  }
}
