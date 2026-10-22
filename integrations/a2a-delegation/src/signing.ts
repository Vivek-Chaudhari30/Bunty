// Request signing between paired assistants (docs/architecture/a2a-delegation-protocol.md
// section 3, and decision D-10 for the gateway layer).
//
// Two signatures on every request except `pair`:
// - X-Bunty-Gateway-Signature: receiver's assistant-wide ingress secret. The Vellum gateway
//   checks it before our route runs ("a paired peer sent this").
// - X-Bunty-Signature: the pair's shared secret. Our route checks it ("this peer sent this").
// Both sign `timestamp + "." + nonce + "." + rawBody`.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_SECONDS = 300;
export const NONCE_TTL_MS = 10 * 60 * 1000;
export const MAX_BODY_BYTES = 25 * 1024 * 1024;
export const RATE_LIMIT_PER_MINUTE = 30;
export const FAILURES_BEFORE_PAUSE = 5;
export const FAILURE_WINDOW_MS = 10 * 60 * 1000;

export const H = {
  peer: "x-bunty-peer",
  timestamp: "x-bunty-timestamp",
  nonce: "x-bunty-nonce",
  signature: "x-bunty-signature",
  gatewaySignature: "x-bunty-gateway-signature",
} as const;

export function hmacHex(secret: string, timestamp: string, nonce: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${rawBody}`, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Headers for a request from `selfId` to a peer. */
export function signedHeaders(opts: {
  selfId: string;
  sharedSecret: string;
  peerIngressSecret: string;
  rawBody: string;
  nowMs: number;
  nonce?: string;
}): Record<string, string> {
  const ts = String(Math.floor(opts.nowMs / 1000));
  const nonce = opts.nonce ?? randomBytes(16).toString("hex");
  return {
    "content-type": "application/json",
    [H.peer]: opts.selfId,
    [H.timestamp]: ts,
    [H.nonce]: nonce,
    [H.signature]: hmacHex(opts.sharedSecret, ts, nonce, opts.rawBody),
    [H.gatewaySignature]: hmacHex(opts.peerIngressSecret, ts, nonce, opts.rawBody),
  };
}

/** Remembers nonces for 10 minutes so a captured request cannot be replayed. */
export class NonceCache {
  private seen = new Map<string, number>();
  /** Returns false if this nonce was already used. */
  claim(peerId: string, nonce: string, nowMs: number): boolean {
    for (const [k, exp] of this.seen) if (exp <= nowMs) this.seen.delete(k);
    const key = `${peerId}:${nonce}`;
    if (this.seen.has(key)) return false;
    this.seen.set(key, nowMs + NONCE_TTL_MS);
    return true;
  }
}

/** Sliding one-minute window per peer. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly perMinute = RATE_LIMIT_PER_MINUTE) {}
  allow(key: string, nowMs: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => nowMs - t < 60_000);
    if (recent.length >= this.perMinute) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return true;
  }
}

export type VerifyResult =
  | { ok: true; peerId: string }
  | { ok: false; status: 401 | 413 | 429; reason: string; peerId?: string };

/** Checks the per-peer layer. The gateway has already checked X-Bunty-Gateway-Signature. */
export async function verifyPeerRequest(opts: {
  headers: Headers;
  rawBody: string;
  nowMs: number;
  sharedSecretFor: (peerId: string) => Promise<string | null>;
  nonces: NonceCache;
  limiter: RateLimiter;
}): Promise<VerifyResult> {
  const { headers, rawBody, nowMs } = opts;
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return { ok: false, status: 413, reason: "body_too_large" };
  const peerId = headers.get(H.peer) ?? "";
  const ts = headers.get(H.timestamp) ?? "";
  const nonce = headers.get(H.nonce) ?? "";
  const sig = headers.get(H.signature) ?? "";
  if (!peerId || !ts || !nonce || !sig) return { ok: false, status: 401, reason: "missing_headers" };
  const secret = await opts.sharedSecretFor(peerId);
  if (!secret) return { ok: false, status: 401, reason: "unknown_peer" };
  const tsNum = Number(ts);
  if (!Number.isInteger(tsNum) || Math.abs(Math.floor(nowMs / 1000) - tsNum) > MAX_SKEW_SECONDS) {
    return { ok: false, status: 401, reason: "clock_skew", peerId };
  }
  if (!safeEqual(sig, hmacHex(secret, ts, nonce, rawBody))) return { ok: false, status: 401, reason: "bad_signature", peerId };
  if (!opts.nonces.claim(peerId, nonce, nowMs)) return { ok: false, status: 401, reason: "replayed_nonce", peerId };
  if (!opts.limiter.allow(peerId, nowMs)) return { ok: false, status: 429, reason: "rate_limited", peerId };
  return { ok: true, peerId };
}

/** Same check the Vellum gateway does for the gateway layer. Used by tests and the local harness. */
export function verifyGatewayLayer(headers: Headers, rawBody: string, ingressSecret: string): boolean {
  const ts = headers.get(H.timestamp) ?? "";
  const nonce = headers.get(H.nonce) ?? "";
  const sig = headers.get(H.gatewaySignature) ?? "";
  return !!sig && safeEqual(sig, hmacHex(ingressSecret, ts, nonce, rawBody));
}
