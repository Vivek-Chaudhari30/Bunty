// Tells backend/router "this assistant just contacted non-user X", so X's replies
// come back here for 24 h. Signed like every internal router call.
import { createHmac } from "node:crypto";

export class NotConfiguredError extends Error {
  constructor(readonly variable: string, what: string) {
    super(`${what} is not configured: set ${variable} (see .env.example)`);
    this.name = "NotConfiguredError";
  }
}

export interface RouterHintClient {
  sendHint(assistantId: string, counterpartyE164: string): Promise<void>;
}

export class MockRouterHintClient implements RouterHintClient {
  readonly hints: Array<{ assistantId: string; counterparty: string }> = [];
  async sendHint(assistantId: string, counterparty: string) {
    this.hints.push({ assistantId, counterparty });
  }
}

export function signHint(rawBody: string, timestamp: number, key: string): string {
  return createHmac("sha256", key).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export class HttpRouterHintClient implements RouterHintClient {
  private readonly url: string;
  private readonly key: string;
  constructor(env: Record<string, string | undefined>, private readonly fetchFn: typeof fetch = fetch) {
    if (!env.BUNTY_ROUTER_URL) throw new NotConfiguredError("BUNTY_ROUTER_URL", "Router hint");
    if (!env.ROUTER_INTERNAL_HMAC_KEY) throw new NotConfiguredError("ROUTER_INTERNAL_HMAC_KEY", "Router hint");
    this.url = env.BUNTY_ROUTER_URL.replace(/\/+$/, "") + "/outbound-hint";
    this.key = env.ROUTER_INTERNAL_HMAC_KEY;
  }
  async sendHint(assistantId: string, counterparty: string) {
    const body = JSON.stringify({ assistantId, counterparty });
    const ts = Math.floor(Date.now() / 1000);
    const res = await this.fetchFn(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bunty-timestamp": String(ts), "x-bunty-signature": signHint(body, ts, this.key) },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`router hint failed: HTTP ${res.status}`);
  }
}

export function createRouterHintClient(env: Record<string, string | undefined> = process.env): RouterHintClient {
  return env.BUNTY_ADAPTERS === "real" ? new HttpRouterHintClient(env) : new MockRouterHintClient();
}
