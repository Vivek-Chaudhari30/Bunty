// Outside services the router talks to, each behind an interface.
// The mock is the default; set BUNTY_ADAPTERS=real to use the real one (decision D-12).
import { NotConfiguredError } from "./errors.ts";
import { last4 } from "./phone.ts";

/** Sends the onboarding reply to an unknown WhatsApp number from the shared number. */
export interface WhatsAppSender {
  sendText(toE164: string, text: string): Promise<void>;
}

/** Forwards a webhook to an assistant's gateway. */
export interface Forwarder {
  forward(url: string, rawBody: string, headers: Record<string, string>): Promise<{ status: number }>;
}

export class MockWhatsAppSender implements WhatsAppSender {
  readonly sent: Array<{ to: string; text: string }> = [];
  async sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }
}

/** Meta WhatsApp Cloud API, shared number. Needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID. */
export class MetaWhatsAppSender implements WhatsAppSender {
  private readonly token: string;
  private readonly phoneNumberId: string;

  constructor(env: Record<string, string | undefined> = process.env, private readonly fetchFn: typeof fetch = fetch) {
    if (!env.WHATSAPP_ACCESS_TOKEN) throw new NotConfiguredError("WHATSAPP_ACCESS_TOKEN", "Meta WhatsApp sender");
    if (!env.WHATSAPP_PHONE_NUMBER_ID) throw new NotConfiguredError("WHATSAPP_PHONE_NUMBER_ID", "Meta WhatsApp sender");
    this.token = env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  }

  async sendText(to: string, text: string): Promise<void> {
    const res = await this.fetchFn(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: text } }),
    });
    if (!res.ok) throw new Error(`WhatsApp send to ${last4(to)} failed: HTTP ${res.status}`);
  }
}

export class FetchForwarder implements Forwarder {
  constructor(private readonly fetchFn: typeof fetch = fetch, private readonly timeoutMs = 10_000) {}
  async forward(url: string, rawBody: string, headers: Record<string, string>): Promise<{ status: number }> {
    const res = await this.fetchFn(url, {
      method: "POST",
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return { status: res.status };
  }
}

export function createWhatsAppSender(env: Record<string, string | undefined> = process.env): WhatsAppSender {
  return env.BUNTY_ADAPTERS === "real" ? new MetaWhatsAppSender(env) : new MockWhatsAppSender();
}
