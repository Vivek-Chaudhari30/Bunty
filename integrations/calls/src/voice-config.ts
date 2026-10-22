// The `assistant config set` commands for Indian-language calls
// (docs/architecture/channels-phone-whatsapp.md section 2). Keys checked against
// vellum/assistant/src/config/schemas/{stt,tts,calls}.ts.

export interface VoiceEnv {
  /** ElevenLabs voice ids per language; empty ones are skipped. */
  ELEVENLABS_VOICE_HI?: string;
  ELEVENLABS_VOICE_EN?: string;
  ELEVENLABS_VOICE_GU?: string;
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function voiceConfigCommands(env: VoiceEnv): string[] {
  const voices: Record<string, string> = {};
  if (env.ELEVENLABS_VOICE_HI) voices.hi = env.ELEVENLABS_VOICE_HI;
  if (env.ELEVENLABS_VOICE_EN) voices.en = env.ELEVENLABS_VOICE_EN;
  if (env.ELEVENLABS_VOICE_GU) voices.gu = env.ELEVENLABS_VOICE_GU;

  const cmds = [
    "assistant config set services.stt.provider deepgram",
    // "multi" lets Deepgram follow a speaker switching between Hindi and English (Hinglish).
    "assistant config set services.stt.language multi",
    "assistant config set services.tts.provider elevenlabs",
    // The assistant always says it is an AI calling for its owner (AGENTS.md section 10).
    "assistant config set calls.disclosure.enabled true",
  ];
  if (Object.keys(voices).length > 0) {
    cmds.push(`assistant config set services.tts.providers.elevenlabs.languageVoices ${quote(JSON.stringify(voices))}`);
  }
  return cmds;
}
