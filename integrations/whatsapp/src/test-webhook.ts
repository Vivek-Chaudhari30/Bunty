// Builds Meta WhatsApp Cloud API webhook payloads and their X-Hub-Signature-256,
// so a gateway (or the router) can be tested without a Meta account.
// Payload shape matches vellum/gateway/src/whatsapp/normalize.ts.
import { createHmac } from "node:crypto";

export type TestMessageKind = "text" | "audio" | "image" | "document" | "button";

export interface TestMessageOptions {
  kind: TestMessageKind;
  from: string; // sender digits without "+", as Meta sends them, e.g. "910000000001"
  id?: string;
  text?: string;
  mediaId?: string;
  filename?: string;
  buttonId?: string;
  phoneNumberId?: string;
  profileName?: string;
}

function messageBody(o: TestMessageOptions): Record<string, unknown> {
  const core = { id: o.id ?? `wamid.test.${crypto.randomUUID()}`, from: o.from };
  switch (o.kind) {
    case "text":
      return { ...core, type: "text", text: { body: o.text ?? "hello" } };
    case "audio":
      return { ...core, type: "audio", audio: { id: o.mediaId ?? "media-audio-1", mime_type: "audio/ogg; codecs=opus" } };
    case "image":
      return { ...core, type: "image", image: { id: o.mediaId ?? "media-image-1", mime_type: "image/jpeg", caption: o.text } };
    case "document":
      return {
        ...core,
        type: "document",
        document: { id: o.mediaId ?? "media-doc-1", mime_type: "application/pdf", filename: o.filename ?? "test.pdf" },
      };
    case "button":
      return {
        ...core,
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: o.buttonId ?? "apr:req1:approve_once", title: "Approve" } },
      };
  }
}

export function buildWebhookPayload(o: TestMessageOptions): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "test-waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "910000000000", phone_number_id: o.phoneNumberId ?? "test-phone-number-id" },
              contacts: [{ wa_id: o.from, profile: { name: o.profileName ?? "Owner A" } }],
              messages: [messageBody(o)],
            },
          },
        ],
      },
    ],
  };
}

/** Meta's signature: "sha256=" + hex(HMAC-SHA256(appSecret, rawBody)). */
export function signWebhookBody(rawBody: string, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

export function buildSignedRequest(url: string, o: TestMessageOptions, appSecret: string): Request {
  const raw = JSON.stringify(buildWebhookPayload(o));
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signWebhookBody(raw, appSecret) },
    body: raw,
  });
}
