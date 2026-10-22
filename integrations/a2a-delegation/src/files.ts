// Result files: hashing for Gate C, inline vs signed-URL parts, safe local paths.
import { createHash, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { safeEqual } from "./signing.ts";
import type { FilePart } from "./types.ts";

export const INLINE_MAX_BYTES = 5 * 1024 * 1024;
export const FILE_URL_TTL_MS = 24 * 60 * 60 * 1000;

export interface ResultFile {
  filename: string;
  mediaType: string;
  bytes: Uint8Array;
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * One hash for a set of files (name + content), order-independent. Gate C approves
 * this hash; a status push whose files hash differently is refused.
 */
export function manifestHash(files: Array<{ filename: string; sha256: string }>): string {
  const lines = files.map((f) => `${f.filename}\u0000${f.sha256}`).sort();
  return sha256Hex(lines.join("\n"));
}

export function hashResultFiles(files: ResultFile[]): string {
  return manifestHash(files.map((f) => ({ filename: f.filename, sha256: sha256Hex(f.bytes) })));
}

const MEDIA: Record<string, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  html: "text/html",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function mediaTypeFor(filename: string): string {
  return MEDIA[filename.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Strips directories and odd characters from a peer-supplied file name. */
export function safeFilename(name: string): string {
  const base = basename(name.replace(/\\/g, "/")).replace(/[^\w.\- ]/g, "_").replace(/^\.+/, "");
  return (base || "file").slice(0, 120);
}

/** Reads files the owner approved, only from inside `root` (the assistant's workspace). */
export class WorkspaceFiles {
  constructor(private readonly root: string) {}
  read(path: string): ResultFile {
    const full = resolve(this.root, path);
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error(`file is outside the workspace: ${path}`);
    const filename = safeFilename(basename(full));
    return { filename, mediaType: mediaTypeFor(filename), bytes: new Uint8Array(readFileSync(full)) };
  }
  resolveInside(path: string): string {
    const full = resolve(this.root, path);
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error(`file is outside the workspace: ${path}`);
    return full;
  }
}

/** Saves received result files under dataDir/received/<taskId>/. */
export function saveReceived(dataDir: string, taskId: string, files: ResultFile[]): string[] {
  const dir = join(dataDir, "received", safeFilename(taskId));
  mkdirSync(dir, { recursive: true });
  return files.map((f) => {
    const p = join(dir, safeFilename(f.filename));
    writeFileSync(p, f.bytes);
    return p;
  });
}

export function signFileUrl(secret: string, fileId: string, exp: number): string {
  return createHmac("sha256", secret).update(`${fileId}.${exp}`).digest("hex");
}

export function checkFileUrl(secret: string, fileId: string, exp: number, sig: string, nowMs: number): boolean {
  return exp > nowMs && safeEqual(sig, signFileUrl(secret, fileId, exp));
}

export function inlinePart(f: ResultFile): FilePart {
  return { kind: "file", filename: f.filename, media_type: f.mediaType, raw: Buffer.from(f.bytes).toString("base64") };
}
