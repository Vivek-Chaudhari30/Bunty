// Two assistants (Chintu for Owner A, Sujal for Owner B) wired together in one process.
// The in-process transport plays the Vellum gateway: it checks the pair bearer token and
// the gateway-layer signature before calling the plugin, as the real gateway would.
import { A2ADb } from "../src/db.ts";
import { dispatch, type IngressPath } from "../src/http.ts";
import { MemoryNotifier } from "../src/notifier.ts";
import { FIELDS, MemorySecretStore } from "../src/secrets.ts";
import { A2AService, type ServiceDeps } from "../src/service.ts";
import { verifyGatewayLayer } from "../src/signing.ts";
import type { Transport } from "../src/transport.ts";

export interface Side {
  service: A2AService;
  db: A2ADb;
  secrets: MemorySecretStore;
  notifier: MemoryNotifier;
  baseUrl: string;
}

export class InProcessTransport implements Transport {
  readonly sides = new Map<string, Side>();
  /** Set to make the next N requests fail with a network error (peer unreachable). */
  failNext = 0;
  readonly log: Array<{ url: string; status: number }> = [];

  private find(url: string): { side: Side; path: string; query: string } {
    for (const [base, side] of this.sides) {
      if (url.startsWith(base + "/")) {
        const rest = url.slice(base.length + 1);
        const [path, query = ""] = rest.split("?");
        return { side, path: path!, query };
      }
    }
    throw new Error(`no assistant at ${url}`);
  }

  private async gateway(url: string, method: string, headers: Record<string, string>, body: string): Promise<Response> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("connect ECONNREFUSED");
    }
    const { side, path, query } = this.find(url);
    const h = new Headers(headers);
    if (path === "pair") {
      const expected = await side.secrets.get(FIELDS.pairToken);
      const bearer = h.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!expected || bearer !== expected) return new Response("not found", { status: 404 });
    } else {
      const ingress = await side.secrets.get(FIELDS.ingress);
      if (!ingress || !verifyGatewayLayer(h, body, ingress)) return new Response("not found", { status: 404 });
    }
    const req = new Request(`${side.baseUrl}/${path}${query ? "?" + query : ""}`, {
      method,
      headers: h,
      ...(method === "POST" ? { body } : {}),
    });
    const res = await dispatch(side.service, path as IngressPath, req);
    this.log.push({ url, status: res.status });
    return res;
  }

  async post(url: string, headers: Record<string, string>, body: string) {
    const res = await this.gateway(url, "POST", headers, body);
    return { status: res.status, body: await res.text() };
  }

  async get(url: string, headers: Record<string, string>) {
    const res = await this.gateway(url, "GET", headers, "");
    return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
  }
}

export interface Pair {
  chintu: Side;
  sujal: Side;
  transport: InProcessTransport;
  clock: { now: number };
}

export function makeSide(
  transport: InProcessTransport,
  clock: { now: number },
  id: string,
  name: string,
  owner: string,
  extra: Partial<ServiceDeps> = {},
  make: (deps: ServiceDeps) => A2AService = (d) => new A2AService(d),
): Side {
  const db = new A2ADb();
  const secrets = new MemorySecretStore();
  const notifier = new MemoryNotifier();
  const baseUrl = `https://${id}.example.com/webhooks/plugins/a2a-delegation`;
  const service = make({
    db,
    secrets,
    transport,
    notifier,
    selfId: id,
    selfName: name,
    ownerName: owner,
    selfBaseUrl: async () => baseUrl,
    now: () => clock.now,
    sleep: async () => {},
    ...extra,
  });
  const side = { service, db, secrets, notifier, baseUrl };
  transport.sides.set(baseUrl, side);
  return side;
}

export function makePair(make?: (deps: ServiceDeps) => A2AService, extra: Partial<ServiceDeps> = {}): Pair {
  const transport = new InProcessTransport();
  const clock = { now: Date.parse("2026-01-01T10:00:00+05:30") };
  return {
    transport,
    clock,
    chintu: makeSide(transport, clock, "chintu", "Chintu", "Owner A", extra, make),
    sujal: makeSide(transport, clock, "sujal", "Sujal", "Owner B", extra, make),
  };
}

export async function pairUp(p: Pair): Promise<void> {
  const { link } = await p.chintu.service.createInvite();
  await p.sujal.service.redeemInvite(link);
}
