// Audit log of outward actions: what was sent, how, and to whom (last 4 digits or peer id).
// Never the message text.
import { appendFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface AuditEntry {
  at: number;
  planId: string;
  route: string;
  target: string;
}

export interface AuditLog {
  record(e: AuditEntry): void;
  list(): AuditEntry[];
  clear(): void;
}

export function maskTarget(phone: string | null, peerId: string | null): string {
  return phone ? `***${phone.slice(-4)}` : `peer:${peerId ?? "?"}`;
}

export class MemoryAuditLog implements AuditLog {
  entries: AuditEntry[] = [];
  record(e: AuditEntry) {
    this.entries.push(e);
  }
  list() {
    return [...this.entries];
  }
  clear() {
    this.entries = [];
  }
}

/** One JSON line per action in the plugin's data dir. */
export class FileAuditLog implements AuditLog {
  private readonly file: string;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "audit.jsonl");
  }
  record(e: AuditEntry) {
    appendFileSync(this.file, JSON.stringify(e) + "\n", { mode: 0o600 });
  }
  list(): AuditEntry[] {
    try {
      return readFileSync(this.file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as AuditEntry);
    } catch {
      return [];
    }
  }
  clear() {
    rmSync(this.file, { force: true });
  }
}
