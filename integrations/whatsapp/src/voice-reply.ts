// Voice-note replies (decision D-07): voice note in -> voice note out, text in -> text out,
// unless the user turned voice replies off. Text-to-speech and the WhatsApp audio send are
// adapters: mock by default, real with BUNTY_ADAPTERS=real (decision D-12).
//
// Not wired into Vellum yet: Vellum's WhatsApp sender only sends image, video and document
// (vellum/assistant/src/messaging/providers/whatsapp/send.ts). Wiring needs a small `vellum/`
// edit or a plugin hook, which needs the team's OK.

export class NotConfiguredError extends Error {
  constructor(readonly variable: string, what: string) {
    super(`${what} is not configured: set ${variable} (see .env.example)`);
    this.name = "NotConfiguredError";
  }
}

export type InputKind = "text" | "audio" | "image" | "document";
export type Lang = "hi" | "en" | "gu";

export interface Audio {
  bytes: Uint8Array;
  mimeType: string;
}

export interface TtsAdapter {
  synthesize(text: string, lang: Lang): Promise<Audio>;
}

export interface WhatsAppMessenger {
  sendText(toE164: string, text: string): Promise<void>;
  sendAudio(toE164: string, audio: Audio): Promise<void>;
}

/** Reply in the same form as the message we got, unless the user turned voice off. */
export function replyMode(input: InputKind, voiceRepliesOff = false): "voice" | "text" {
  return input === "audio" && !voiceRepliesOff ? "voice" : "text";
}

/** WhatsApp voice notes over ~2 minutes are tiring to listen to; long answers go as text. */
export const MAX_VOICE_CHARS = 1200;

export interface ReplyResult {
  sentAs: "voice" | "text";
  fellBack?: string;
}

export async function sendReply(
  deps: { tts: TtsAdapter; whatsapp: WhatsAppMessenger },
  to: string,
  text: string,
  opts: { input: InputKind; lang: Lang; voiceRepliesOff?: boolean },
): Promise<ReplyResult> {
  if (replyMode(opts.input, opts.voiceRepliesOff) === "text") {
    await deps.whatsapp.sendText(to, text);
    return { sentAs: "text" };
  }
  if (text.length > MAX_VOICE_CHARS) {
    await deps.whatsapp.sendText(to, text);
    return { sentAs: "text", fellBack: "too_long" };
  }
  try {
    const audio = await deps.tts.synthesize(text, opts.lang);
    await deps.whatsapp.sendAudio(to, audio);
    return { sentAs: "voice" };
  } catch (err) {
    // Never leave the user without an answer: send the text instead.
    await deps.whatsapp.sendText(to, text);
    return { sentAs: "text", fellBack: String(err) };
  }
}

// ── Mocks (default) ──────────────────────────────────────────────────────

export class MockTts implements TtsAdapter {
  readonly calls: Array<{ text: string; lang: Lang }> = [];
  async synthesize(text: string, lang: Lang): Promise<Audio> {
    this.calls.push({ text, lang });
    return { bytes: new TextEncoder().encode(`mock-audio:${lang}:${text.length}`), mimeType: "audio/mpeg" };
  }
}

export class MockWhatsAppMessenger implements WhatsAppMessenger {
  readonly sent: Array<{ to: string; text?: string; audioBytes?: number }> = [];
  async sendText(to: string, text: string) {
    this.sent.push({ to, text });
  }
  async sendAudio(to: string, audio: Audio) {
    this.sent.push({ to, audioBytes: audio.bytes.byteLength });
  }
}

// ── Real adapters ────────────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

/** ElevenLabs text to speech, one voice per language (ELEVENLABS_VOICE_HI / _EN / _GU). */
export class ElevenLabsTts implements TtsAdapter {
  private readonly key: string;
  constructor(private readonly env: Env, private readonly fetchFn: typeof fetch = fetch) {
    if (!env.ELEVENLABS_API_KEY) throw new NotConfiguredError("ELEVENLABS_API_KEY", "ElevenLabs text to speech");
    this.key = env.ELEVENLABS_API_KEY;
  }
  async synthesize(text: string, lang: Lang): Promise<Audio> {
    const name = `ELEVENLABS_VOICE_${lang.toUpperCase()}`;
    const voice = this.env[name] ?? this.env.ELEVENLABS_VOICE_EN;
    if (!voice) throw new NotConfiguredError(name, "ElevenLabs voice");
    const res = await this.fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": this.key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
  }
}

/** Meta WhatsApp Cloud API: upload the audio, then send it as an audio message. */
export class MetaWhatsAppMessenger implements WhatsAppMessenger {
  private readonly token: string;
  private readonly phoneNumberId: string;
  constructor(env: Env, private readonly fetchFn: typeof fetch = fetch) {
    if (!env.WHATSAPP_ACCESS_TOKEN) throw new NotConfiguredError("WHATSAPP_ACCESS_TOKEN", "WhatsApp sender");
    if (!env.WHATSAPP_PHONE_NUMBER_ID) throw new NotConfiguredError("WHATSAPP_PHONE_NUMBER_ID", "WhatsApp sender");
    this.token = env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  }
  private url(path: string) {
    return `https://graph.facebook.com/v21.0/${this.phoneNumberId}/${path}`;
  }
  private async send(body: Record<string, unknown>) {
    const res = await this.fetchFn(this.url("messages"), {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    if (!res.ok) throw new Error(`WhatsApp send HTTP ${res.status}`);
  }
  async sendText(to: string, text: string) {
    await this.send({ to: to.replace(/^\+/, ""), type: "text", text: { body: text } });
  }
  async sendAudio(to: string, audio: Audio) {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", audio.mimeType);
    form.append("file", new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType }), "reply.mp3");
    const up = await this.fetchFn(this.url("media"), { method: "POST", headers: { authorization: `Bearer ${this.token}` }, body: form });
    if (!up.ok) throw new Error(`WhatsApp media upload HTTP ${up.status}`);
    const { id } = (await up.json()) as { id?: string };
    if (!id) throw new Error("WhatsApp media upload returned no id");
    await this.send({ to: to.replace(/^\+/, ""), type: "audio", audio: { id } });
  }
}

export function createVoiceReplyAdapters(env: Env = process.env): { tts: TtsAdapter; whatsapp: WhatsAppMessenger } {
  if (env.BUNTY_ADAPTERS === "real") return { tts: new ElevenLabsTts(env), whatsapp: new MetaWhatsAppMessenger(env) };
  return { tts: new MockTts(), whatsapp: new MockWhatsAppMessenger() };
}
