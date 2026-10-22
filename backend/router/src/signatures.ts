// Signature checks for everything that reaches the router.
import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Meta: X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(appSecret, rawBody)). */
export function signMeta(rawBody: string, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

export function verifyMeta(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  return safeEqual(header, signMeta(rawBody, appSecret));
}

/**
 * Twilio: X-Twilio-Signature = base64(HMAC-SHA1(authToken, url + each POST param
 * name and value, sorted by name)). `url` must be the exact public URL Twilio called.
 */
export function signTwilio(url: string, params: Record<string, string>, authToken: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilio(
  url: string,
  params: Record<string, string>,
  header: string | null,
  authToken: string,
): boolean {
  if (!header || !authToken) return false;
  return safeEqual(header, signTwilio(url, params, authToken));
}

/**
 * Internal calls from our own assistants (outbound hint, user admin):
 * X-Bunty-Signature = hex(HMAC-SHA256(key, timestamp + "." + rawBody)), timestamp in
 * unix seconds, accepted within 300 s.
 */
export const INTERNAL_SKEW_SECONDS = 300;

export function signInternal(rawBody: string, timestamp: number, key: string): string {
  return createHmac("sha256", key).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifyInternal(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  key: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!timestampHeader || !signatureHeader || !key) return false;
  const ts = Number(timestampHeader);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > INTERNAL_SKEW_SECONDS) return false;
  return safeEqual(signatureHeader, signInternal(rawBody, ts, key));
}
