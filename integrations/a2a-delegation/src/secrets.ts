// Where shared secrets live. Inside an assistant: Vellum's credential store
// (service "a2a-delegation"), never SQLite. In tests: memory.

export interface SecretStore {
  get(field: string): Promise<string | null>;
  set(field: string, value: string): Promise<void>;
  remove(field: string): Promise<void>;
}

export const FIELDS = {
  /** Our assistant-wide gateway secret (the gateway checks X-Bunty-Gateway-Signature with it). */
  ingress: "ingress_hmac_secret",
  /** Bearer secret for the `pair` route: the one open invite token. */
  pairToken: "pair_token",
  /** Shared HMAC secret with one peer. */
  peer: (peerId: string) => `peer_${peerId}`,
  /** That peer's gateway secret, used when we send to them. */
  peerIngress: (peerId: string) => `peer_${peerId}_ingress`,
} as const;

export class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>();
  async get(field: string) {
    return this.values.get(field) ?? null;
  }
  async set(field: string, value: string) {
    this.values.set(field, value);
  }
  async remove(field: string) {
    this.values.delete(field);
  }
}

/** Vellum credential store through @vellumai/plugin-api. */
export class VellumSecretStore implements SecretStore {
  private ref(field: string) {
    return `a2a-delegation/${field}`;
  }
  async get(field: string) {
    const { resolveCredential } = await import("@vellumai/plugin-api");
    try {
      return await resolveCredential(this.ref(field));
    } catch {
      return null;
    }
  }
  async set(field: string, value: string) {
    const { storeCredential } = await import("@vellumai/plugin-api");
    await storeCredential(this.ref(field), value, {
      description: "Bunty assistant-to-assistant secret. Created by the plugin; never shown to anyone.",
      skipTranscriptScrub: true,
    });
  }
  async remove(field: string) {
    // The plugin API has no delete; overwrite with a random value so the old secret stops working.
    await this.set(field, crypto.randomUUID() + crypto.randomUUID());
  }
}
