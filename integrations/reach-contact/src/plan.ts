// A reach plan: exactly what will happen, read back to the owner before anything is sent.
// The approved plan is stored, and the send step must match it word for word.
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Route } from "./route-policy.ts";

export const PLAN_TTL_MS = 30 * 60 * 1000;

export interface ReachPlan {
  id: string;
  contactName: string;
  route: Route;
  phone: string | null;
  peerId: string | null;
  message: string;
  notifyRouter: boolean;
  createdAt: number;
  usedAt: number | null;
  /** Hash of the fields above, so a stored plan cannot be quietly changed. */
  digest: string;
}

export function planDigest(p: Pick<ReachPlan, "contactName" | "route" | "phone" | "peerId" | "message">): string {
  return createHash("sha256")
    .update(JSON.stringify([p.contactName, p.route, p.phone, p.peerId, p.message]))
    .digest("hex");
}

export function newPlan(fields: Omit<ReachPlan, "id" | "createdAt" | "usedAt" | "digest">, now = Date.now()): ReachPlan {
  return { ...fields, id: `plan_${randomUUID()}`, createdAt: now, usedAt: null, digest: planDigest(fields) };
}

const ROUTE_WORDS: Record<Route, string> = {
  call: "call",
  whatsapp: "send a WhatsApp to",
  a2a_note: "send a note through their assistant to",
  a2a_task: "send a task through their assistant to",
};

/** The read-back the owner sees. Short and plain. */
export function readBack(p: ReachPlan): string {
  const where = p.phone ? ` on ${p.phone}` : p.peerId ? ` (assistant: ${p.peerId})` : "";
  const verb = ROUTE_WORDS[p.route];
  const say = p.route === "call" ? "and say" : "saying";
  return `I'll ${verb} ${p.contactName}${where} ${say}: "${p.message}". Go, change, or cancel?`;
}

export interface PlanStore {
  save(p: ReachPlan): void;
  get(id: string): ReachPlan | null;
  markUsed(id: string, now?: number): void;
  /** "Delete my data". */
  clear(): void;
}

export class MemoryPlanStore implements PlanStore {
  private plans = new Map<string, ReachPlan>();
  save(p: ReachPlan) {
    this.plans.set(p.id, { ...p });
  }
  get(id: string) {
    const p = this.plans.get(id);
    return p ? { ...p } : null;
  }
  markUsed(id: string, now = Date.now()) {
    const p = this.plans.get(id);
    if (p) p.usedAt = now;
  }
  clear() {
    this.plans.clear();
  }
}

/** One JSON file in the plugin's data dir. Plans are few and short-lived. */
export class FilePlanStore implements PlanStore {
  private readonly file: string;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "plans.json");
  }
  private read(): Record<string, ReachPlan> {
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as Record<string, ReachPlan>;
    } catch {
      return {};
    }
  }
  private write(all: Record<string, ReachPlan>) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, v] of Object.entries(all)) if (v.createdAt < cutoff) delete all[k];
    writeFileSync(this.file, JSON.stringify(all), { mode: 0o600 });
  }
  save(p: ReachPlan) {
    const all = this.read();
    all[p.id] = p;
    this.write(all);
  }
  get(id: string) {
    return this.read()[id] ?? null;
  }
  markUsed(id: string, now = Date.now()) {
    const all = this.read();
    if (all[id]) all[id].usedAt = now;
    this.write(all);
  }
  clear() {
    rmSync(this.file, { force: true });
  }
}

export type PlanCheck = { ok: true; plan: ReachPlan } | { ok: false; error: string };

/** The send step may only run an unused, fresh, unchanged plan. */
export function checkPlanForSend(store: PlanStore, id: string, now = Date.now()): PlanCheck {
  const plan = store.get(id);
  if (!plan) return { ok: false, error: "unknown plan_id: make a plan first with reach_contact_plan" };
  if (plan.usedAt !== null) return { ok: false, error: "this plan was already sent; make a new plan" };
  if (now - plan.createdAt > PLAN_TTL_MS) return { ok: false, error: "this plan is older than 30 minutes; make a new plan" };
  if (planDigest(plan) !== plan.digest) return { ok: false, error: "plan was modified after it was made; make a new plan" };
  return { ok: true, plan };
}
