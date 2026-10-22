// Per-number rate limits and simple counters for /metrics.

/** Sliding one-minute window per key. In memory: limits reset when the router restarts. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(readonly perMinute: number) {}
  allow(key: string, nowMs: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => nowMs - t < 60_000);
    const ok = recent.length < this.perMinute;
    if (ok) recent.push(nowMs);
    this.hits.set(key, recent);
    return ok;
  }
}

/** WhatsApp messages and calls allowed per sender number per minute. */
export const WHATSAPP_PER_MINUTE = 30;
export const CALLS_PER_MINUTE = 5;

export class Metrics {
  private counts = new Map<string, number>();
  inc(name: string, by = 1): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + by);
  }
  get(name: string): number {
    return this.counts.get(name) ?? 0;
  }
  /** Prometheus text format. Counters only, no numbers or message content. */
  render(): string {
    return [...this.counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `# TYPE bunty_router_${k} counter\nbunty_router_${k} ${v}`)
      .join("\n") + "\n";
  }
}
