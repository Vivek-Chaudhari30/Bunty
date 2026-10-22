import { describe, expect, test } from "bun:test";
import { checkCalls, parseCallsCsv } from "./src/exit-check.ts";
import { voiceConfigCommands } from "./src/voice-config.ts";

describe("voice config", () => {
  test("always sets multilingual STT and AI disclosure", () => {
    const cmds = voiceConfigCommands({});
    expect(cmds).toContain("assistant config set services.stt.language multi");
    expect(cmds).toContain("assistant config set calls.disclosure.enabled true");
    expect(cmds.some((c) => c.includes("languageVoices"))).toBe(false);
  });

  test("adds per-language voices only when given", () => {
    const cmds = voiceConfigCommands({ ELEVENLABS_VOICE_HI: "voice-hi", ELEVENLABS_VOICE_GU: "voice-gu" });
    expect(cmds.at(-1)).toBe(
      `assistant config set services.tts.providers.elevenlabs.languageVoices '{"hi":"voice-hi","gu":"voice-gu"}'`,
    );
  });
});

describe("Phase 4 exit check", () => {
  const good = Array.from({ length: 10 }, () => ({ ok: true, firstReplyMs: 2000 }));

  test("10 calls, no failures, fast enough: pass", () => {
    expect(checkCalls(good)).toMatchObject({ pass: true, averageFirstReplyMs: 2000 });
  });

  test("one failure is allowed, two are not", () => {
    expect(checkCalls([...good.slice(1), { ok: false, firstReplyMs: null }]).pass).toBe(true);
    const two = [...good.slice(2), { ok: false, firstReplyMs: null }, { ok: false, firstReplyMs: null }];
    expect(checkCalls(two).pass).toBe(false);
  });

  test("slow average fails, too few calls fails", () => {
    expect(checkCalls(good.map((c) => ({ ...c, firstReplyMs: 2500 }))).pass).toBe(false);
    expect(checkCalls(good.slice(0, 9)).reasons[0]).toContain("only 9 calls");
  });

  test("parses the CSV the testers fill in", () => {
    expect(parseCallsCsv("ok,first_reply_ms,language\n1,1800,hi\n0,,gu\n")).toEqual([
      { ok: true, firstReplyMs: 1800, language: "hi" },
      { ok: false, firstReplyMs: null, language: "gu" },
    ]);
  });
});
