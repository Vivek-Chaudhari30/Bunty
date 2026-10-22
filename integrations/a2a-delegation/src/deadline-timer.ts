// Runs the deadline sweep on a plain timer inside the assistant process, started by
// hooks/init.ts and stopped by hooks/shutdown.ts. No model turn runs; the owner is only
// told (through the notifier) when a task we sent is actually past its deadline.

export const SWEEP_INTERVAL_MS = 15 * 60_000;
/** First sweep shortly after start, so tasks that went overdue while we were down are noticed. */
export const FIRST_SWEEP_MS = 60_000;

type Log = (msg: string, fields?: Record<string, unknown>) => void;

export interface TimerFns {
  setTimeout: (fn: () => void, ms: number) => unknown;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  clearInterval: (handle: unknown) => void;
}

const realTimers: TimerFns = {
  setTimeout: (fn, ms) => unref(setTimeout(fn, ms)),
  setInterval: (fn, ms) => unref(setInterval(fn, ms)),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/** Lets the assistant exit without waiting for our timer. */
function unref<T>(handle: T): T {
  (handle as { unref?: () => void }).unref?.();
  return handle;
}

// Kept on globalThis so a plugin reload (which may import this module again) still finds
// and stops the previous timer instead of starting a second one.
const SLOT = Symbol.for("bunty.a2a-delegation.deadline-timer");
type Slot = { stop: () => void };
const g = globalThis as unknown as Record<symbol, Slot | undefined>;

/**
 * Starts the sweep: once after `firstMs`, then every `intervalMs`. A run that is still going
 * when the next one is due is skipped. Errors are logged, never thrown. Calling it again
 * replaces the running timer.
 */
export function startDeadlineTimer(opts: {
  sweep: () => Promise<number>;
  log: Log;
  intervalMs?: number;
  firstMs?: number;
  timers?: TimerFns;
}): () => void {
  stopDeadlineTimer();
  const t = opts.timers ?? realTimers;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await opts.sweep();
      if (n) opts.log("deadline sweep told the owner", { overdue: n });
    } catch (err) {
      opts.log("deadline sweep failed", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  };
  const first = t.setTimeout(() => void tick(), opts.firstMs ?? FIRST_SWEEP_MS);
  const every = t.setInterval(() => void tick(), opts.intervalMs ?? SWEEP_INTERVAL_MS);
  const stop = () => {
    t.clearTimeout(first);
    t.clearInterval(every);
    if (g[SLOT]?.stop === stop) g[SLOT] = undefined;
  };
  g[SLOT] = { stop };
  return stop;
}

export function stopDeadlineTimer(): void {
  g[SLOT]?.stop();
}
