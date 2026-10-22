// How we reach a peer assistant over HTTPS, with retries (protocol section 9:
// 3 retries at 2 s, 4 s, 8 s). Tests swap in an in-process transport.

export interface PeerResponse {
  status: number;
  body: string;
}

export interface Transport {
  post(url: string, headers: Record<string, string>, body: string): Promise<PeerResponse>;
  get(url: string, headers: Record<string, string>): Promise<{ status: number; bytes: Uint8Array }>;
}

export class FetchTransport implements Transport {
  constructor(private readonly fetchFn: typeof fetch = fetch, private readonly timeoutMs = 20_000) {}
  async post(url: string, headers: Record<string, string>, body: string): Promise<PeerResponse> {
    const res = await this.fetchFn(url, { method: "POST", headers, body, signal: AbortSignal.timeout(this.timeoutMs) });
    return { status: res.status, body: await res.text() };
  }
  async get(url: string, headers: Record<string, string>) {
    const res = await this.fetchFn(url, { headers, signal: AbortSignal.timeout(this.timeoutMs * 3) });
    return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
  }
}

export const RETRY_DELAYS_MS = [2000, 4000, 8000];

export class PeerUnreachableError extends Error {
  constructor(readonly url: string, readonly lastError: string) {
    super(`peer unreachable after ${RETRY_DELAYS_MS.length + 1} tries: ${lastError}`);
    this.name = "PeerUnreachableError";
  }
}

/**
 * POST with retries on network errors and 5xx. 4xx is returned at once (retrying a
 * rejected request does not help). `makeRequest` re-signs each try (fresh nonce).
 */
export async function postWithRetry(
  transport: Transport,
  url: string,
  makeRequest: () => { headers: Record<string, string>; body: string },
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<PeerResponse> {
  let last = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { headers, body } = makeRequest();
      const res = await transport.post(url, headers, body);
      if (res.status < 500) return res;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = String(err);
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]!);
  }
  throw new PeerUnreachableError(url, last);
}
