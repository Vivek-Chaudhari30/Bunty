import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { buildSignedRequest, buildWebhookPayload, signWebhookBody } from "./src/test-webhook.ts";

const SECRET = "test-app-secret";

function firstMessage(p: Record<string, unknown>): Record<string, unknown> {
  const entry = (p.entry as Array<{ changes: Array<{ value: { messages: Array<Record<string, unknown>> } }> }>)[0]!;
  return entry.changes[0]!.value.messages[0]!;
}

describe("WhatsApp test webhooks", () => {
  test("text message has the fields the Vellum normalizer needs", () => {
    const m = firstMessage(buildWebhookPayload({ kind: "text", from: "910000000001", text: "hi" }));
    expect(m.type).toBe("text");
    expect(m.from).toBe("910000000001");
    expect(typeof m.id).toBe("string");
    expect(m.text).toEqual({ body: "hi" });
  });

  test("voice note, photo, document and approval button shapes", () => {
    expect(firstMessage(buildWebhookPayload({ kind: "audio", from: "1" })).type).toBe("audio");
    expect(firstMessage(buildWebhookPayload({ kind: "image", from: "1" })).type).toBe("image");
    const doc = firstMessage(buildWebhookPayload({ kind: "document", from: "1", filename: "a.pdf" }));
    expect((doc.document as { filename: string }).filename).toBe("a.pdf");
    const btn = firstMessage(buildWebhookPayload({ kind: "button", from: "1", buttonId: "apr:r1:approve_once" }));
    expect(btn.type).toBe("interactive");
  });

  test("signature matches Meta's scheme over the exact raw body", async () => {
    const req = buildSignedRequest("http://localhost/webhooks/whatsapp", { kind: "text", from: "1" }, SECRET);
    const raw = await req.text();
    const expected = "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
    expect(req.headers.get("x-hub-signature-256")).toBe(expected);
    expect(signWebhookBody(raw, SECRET)).toBe(expected);
  });
});
