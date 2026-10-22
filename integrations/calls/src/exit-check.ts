// Phase 4 exit check from ROADMAP.md: 10 test calls, at most 1 failure,
// average first reply under 2.5 s.

export interface TestCall {
  ok: boolean;
  /** Time from the caller finishing their first sentence to the assistant starting to speak. */
  firstReplyMs: number | null;
  language?: string;
}

export interface ExitCheckResult {
  pass: boolean;
  calls: number;
  failures: number;
  averageFirstReplyMs: number | null;
  reasons: string[];
}

export const MIN_CALLS = 10;
export const MAX_FAILURES = 1;
export const MAX_AVG_FIRST_REPLY_MS = 2500;

export function checkCalls(calls: TestCall[]): ExitCheckResult {
  const failures = calls.filter((c) => !c.ok).length;
  const timed = calls.filter((c) => c.ok && c.firstReplyMs !== null).map((c) => c.firstReplyMs!);
  const avg = timed.length > 0 ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : null;
  const reasons: string[] = [];
  if (calls.length < MIN_CALLS) reasons.push(`only ${calls.length} calls, need ${MIN_CALLS}`);
  if (failures > MAX_FAILURES) reasons.push(`${failures} failures, allowed ${MAX_FAILURES}`);
  if (avg === null) reasons.push("no timed calls");
  else if (avg >= MAX_AVG_FIRST_REPLY_MS) reasons.push(`average first reply ${avg} ms, need under ${MAX_AVG_FIRST_REPLY_MS}`);
  return { pass: reasons.length === 0, calls: calls.length, failures, averageFirstReplyMs: avg, reasons };
}

/** Reads "ok,first_reply_ms,language" lines (header optional). Empty ms = not timed. */
export function parseCallsCsv(csv: string): TestCall[] {
  return csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("ok,"))
    .map((line) => {
      const [ok, ms, language] = line.split(",").map((s) => s.trim());
      return {
        ok: ok === "1" || ok?.toLowerCase() === "true" || ok?.toLowerCase() === "yes",
        firstReplyMs: ms ? Number(ms) : null,
        language: language || undefined,
      };
    });
}
