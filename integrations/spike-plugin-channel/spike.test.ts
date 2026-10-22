import { describe, expect, test } from "bun:test";
import { POST } from "./routes/inbound.ts";
import approvalTool from "./tools/spike_fresh_approval.ts";

const ctx = { conversationId: "c1", workingDir: "/tmp", trustClass: "trusted_contact" };

describe("spike A: inbound route", () => {
  test("returns the gateway inbound envelope", async () => {
    const res = await POST(
      new Request("http://x/inbound", {
        method: "POST",
        body: JSON.stringify({ text: "hello", from: "+910000000002", chatId: "chat-1", messageId: "m1" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message: { content: "hello", conversationExternalId: "chat-1", externalMessageId: "m1" },
      actor: { actorExternalId: "+910000000002" },
      source: { chatType: "dm" },
    });
  });

  test("rejects a delivery with missing fields", async () => {
    const res = await POST(new Request("http://x/inbound", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});

describe("spike B: approval check", () => {
  test("refuses without a fresh approval", async () => {
    const r = await approvalTool.execute({}, ctx);
    expect(r.isError).toBe(true);
  });

  test("acts when the owner approved this call", async () => {
    const r = await approvalTool.execute({}, { ...ctx, approvedViaPrompt: true });
    expect(r.isError).toBe(false);
  });
});
