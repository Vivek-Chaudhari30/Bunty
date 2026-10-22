import { describe, expect, test } from "bun:test";
import {
  createVoiceReplyAdapters,
  ElevenLabsTts,
  MAX_VOICE_CHARS,
  MetaWhatsAppMessenger,
  MockTts,
  MockWhatsAppMessenger,
  replyMode,
  sendReply,
  type TtsAdapter,
} from "./src/voice-reply.ts";

const TO = "+910000000001";

describe("reply mode (D-07)", () => {
  test("mirrors the input; the user can turn voice off", () => {
    expect(replyMode("audio")).toBe("voice");
    expect(replyMode("text")).toBe("text");
    expect(replyMode("image")).toBe("text");
    expect(replyMode("audio", true)).toBe("text");
  });
});

describe("sendReply", () => {
  test("voice note in: voice note out, in the user's language", async () => {
    const tts = new MockTts();
    const whatsapp = new MockWhatsAppMessenger();
    expect(await sendReply({ tts, whatsapp }, TO, "Theek hai, 7 baje yaad dila dunga.", { input: "audio", lang: "hi" })).toEqual({ sentAs: "voice" });
    expect(tts.calls).toEqual([{ text: "Theek hai, 7 baje yaad dila dunga.", lang: "hi" }]);
    expect(whatsapp.sent[0]!.audioBytes).toBeGreaterThan(0);
  });

  test("text in: text out, no speech synthesis", async () => {
    const tts = new MockTts();
    const whatsapp = new MockWhatsAppMessenger();
    await sendReply({ tts, whatsapp }, TO, "Done.", { input: "text", lang: "en" });
    expect(tts.calls).toHaveLength(0);
    expect(whatsapp.sent).toEqual([{ to: TO, text: "Done." }]);
  });

  test("long answers go as text", async () => {
    const whatsapp = new MockWhatsAppMessenger();
    const r = await sendReply({ tts: new MockTts(), whatsapp }, TO, "x".repeat(MAX_VOICE_CHARS + 1), { input: "audio", lang: "en" });
    expect(r).toEqual({ sentAs: "text", fellBack: "too_long" });
  });

  test("speech failure falls back to text so the user still gets an answer", async () => {
    const broken: TtsAdapter = { synthesize: async () => Promise.reject(new Error("TTS down")) };
    const whatsapp = new MockWhatsAppMessenger();
    const r = await sendReply({ tts: broken, whatsapp }, TO, "Hello", { input: "audio", lang: "en" });
    expect(r.sentAs).toBe("text");
    expect(whatsapp.sent).toEqual([{ to: TO, text: "Hello" }]);
  });
});

describe("adapters", () => {
  test("mocks by default; real ones name the missing key", () => {
    expect(createVoiceReplyAdapters({}).tts).toBeInstanceOf(MockTts);
    expect(() => createVoiceReplyAdapters({ BUNTY_ADAPTERS: "real" })).toThrow(/ELEVENLABS_API_KEY/);
    expect(() => new MetaWhatsAppMessenger({ WHATSAPP_ACCESS_TOKEN: "t" })).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
  });

  test("ElevenLabs request uses the voice for the language", async () => {
    let url = "";
    const fake = (async (u: RequestInfo | URL) => {
      url = String(u);
      return new Response(new Uint8Array([1, 2, 3]));
    }) as typeof fetch;
    const audio = await new ElevenLabsTts({ ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_HI: "voice-hi" }, fake).synthesize("hi", "hi");
    expect(url).toContain("/text-to-speech/voice-hi");
    expect(audio.bytes.byteLength).toBe(3);
    await expect(new ElevenLabsTts({ ELEVENLABS_API_KEY: "k" }, fake).synthesize("x", "gu")).rejects.toThrow(/ELEVENLABS_VOICE_GU/);
  });

  test("Meta audio send uploads first, then sends the media id", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fake = (async (u: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(u), body: init?.body });
      return String(u).endsWith("/media") ? Response.json({ id: "media-1" }) : Response.json({ ok: true });
    }) as typeof fetch;
    const m = new MetaWhatsAppMessenger({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "pn" }, fake);
    await m.sendAudio(TO, { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" });
    expect(calls.map((c) => c.url)).toEqual(["https://graph.facebook.com/v21.0/pn/media", "https://graph.facebook.com/v21.0/pn/messages"]);
    expect(JSON.parse(String(calls[1]!.body))).toEqual({ messaging_product: "whatsapp", to: "910000000001", type: "audio", audio: { id: "media-1" } });
  });
});
