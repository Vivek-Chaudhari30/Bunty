// The real service inside a running assistant: SQLite in the plugin data dir,
// secrets in Vellum's credential store, HTTPS to peers, owner told via a conversation turn.
import { join } from "node:path";
import { A2ADb } from "./db.ts";
import { DelegationService } from "./delegation.ts";
import { VellumOwnerNotifier } from "./notifier.ts";
import { VellumSecretStore } from "./secrets.ts";
import { FetchTransport } from "./transport.ts";
import { A2AError } from "./service.ts";

export const OWNER_CONVERSATION_KEY = "owner_conversation_id";

let cached: DelegationService | null = null;

export async function getService(): Promise<DelegationService> {
  if (cached) return cached;
  const api = await import("@vellumai/plugin-api");
  const selfId = process.env.BUNTY_ASSISTANT_ID;
  if (!selfId) throw new A2AError("BUNTY_ASSISTANT_ID is not set for this assistant (see .env.example).");
  const dataDir = join(api.getWorkspaceDir(), "plugins", "a2a-delegation", "data");
  await import("node:fs").then((fs) => fs.mkdirSync(dataDir, { recursive: true }));
  const db = new A2ADb(join(dataDir, "a2a.db"));
  cached = new DelegationService({
    db,
    secrets: new VellumSecretStore(),
    transport: new FetchTransport(),
    notifier: new VellumOwnerNotifier(() => db.getSetting(OWNER_CONVERSATION_KEY)),
    selfId,
    selfName: process.env.BUNTY_ASSISTANT_NAME ?? selfId,
    ownerName: process.env.BUNTY_OWNER_NAME ?? "my owner",
    selfBaseUrl: async () => {
      const pairUrl = await api.resolveWebhookUrl({ path: "pair", plugin: "a2a-delegation" });
      return pairUrl.replace(/\/pair$/, "");
    },
    dataDir,
    log: (msg, fields) => console.log(JSON.stringify({ plugin: "a2a-delegation", msg, ...fields })),
  });
  return cached;
}
