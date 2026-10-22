// The deadline timer with fake timers: when it runs, overlap, errors, stop and restart.
import { afterEach, describe, expect, test } from "bun:test";
import { startDeadlineTimer, stopDeadlineTimer, type TimerFns } from "../src/deadline-timer.ts";

class FakeTimers implements TimerFns {
  timeouts = new Map<number, () => void>();
  intervals = new Map<number, () => void>();
  private next = 1;
  setTimeout = (fn: () => void) => (this.timeouts.set(this.next, fn), this.next++);
  setInterval = (fn: () => void) => (this.intervals.set(this.next, fn), this.next++);
  clearTimeout = (h: unknown) => void this.timeouts.delete(h as number);
  clearInterval = (h: unknown) => void this.intervals.delete(h as number);
  fireFirst() {
    for (const [k, fn] of this.timeouts) (this.timeouts.delete(k), fn());
  }
  fireInterval() {
    for (const fn of this.intervals.values()) fn();
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => stopDeadlineTimer());

describe("deadline timer", () => {
  test("runs once after start, then on every interval", async () => {
    const t = new FakeTimers();
    let runs = 0;
    const logs: string[] = [];
    startDeadlineTimer({ sweep: async () => (++runs, 2), log: (m) => logs.push(m), timers: t });
    expect(runs).toBe(0);
    t.fireFirst();
    await flush();
    t.fireInterval();
    await flush();
    expect(runs).toBe(2);
    expect(logs).toEqual(["deadline sweep told the owner", "deadline sweep told the owner"]);
  });

  test("skips a run while the previous one is still going", async () => {
    const t = new FakeTimers();
    let runs = 0;
    let release!: () => void;
    const sweep = () => (runs++, new Promise<number>((r) => (release = () => r(0))));
    startDeadlineTimer({ sweep, log: () => {}, timers: t });
    t.fireInterval();
    t.fireInterval();
    expect(runs).toBe(1);
    release();
    await flush();
    t.fireInterval();
    expect(runs).toBe(2);
  });

  test("logs a failed sweep and keeps going", async () => {
    const t = new FakeTimers();
    const logs: Array<Record<string, unknown> | undefined> = [];
    startDeadlineTimer({
      sweep: async () => { throw new Error("BUNTY_ASSISTANT_ID is not set"); },
      log: (_m, f) => logs.push(f),
      timers: t,
    });
    t.fireInterval();
    await flush();
    expect(logs).toEqual([{ error: "BUNTY_ASSISTANT_ID is not set" }]);
    expect(t.intervals.size).toBe(1);
  });

  test("stop clears both timers; starting again replaces the old timer", () => {
    const a = new FakeTimers();
    const b = new FakeTimers();
    startDeadlineTimer({ sweep: async () => 0, log: () => {}, timers: a });
    startDeadlineTimer({ sweep: async () => 0, log: () => {}, timers: b });
    expect(a.timeouts.size + a.intervals.size).toBe(0);
    expect(b.intervals.size).toBe(1);
    stopDeadlineTimer();
    expect(b.timeouts.size + b.intervals.size).toBe(0);
  });
});
