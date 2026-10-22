// The logic behind the two reach-contact tools, with its outside pieces passed in
// so tests can run it without a Vellum assistant.
import { checkPlanForSend, newPlan, readBack, type PlanStore, type ReachPlan } from "./plan.ts";
import type { RouterHintClient } from "./router-hint.ts";
import { chooseRoute, explainRefusal, type Verb } from "./route-policy.ts";

export interface CoreDeps {
  plans: PlanStore;
  hints: RouterHintClient;
  /** This assistant's id in the router (BUNTY_ASSISTANT_ID). */
  assistantId: string;
  now?: () => number;
}

export interface Result {
  content: string;
  isError: boolean;
  yieldToUser?: boolean;
}

const VERBS: Verb[] = ["call", "text", "tell", "task"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function makePlan(input: Record<string, unknown>, deps: CoreDeps): Result {
  const verb = str(input.verb) as Verb;
  const name = str(input.contact_name);
  const message = str(input.message);
  if (!VERBS.includes(verb)) return { content: `error: verb must be one of ${VERBS.join(", ")}`, isError: true };
  if (!name) return { content: "error: contact_name is required (resolve it with contact_search first)", isError: true };
  if (!message) return { content: "error: message is required (the exact words to pass on)", isError: true };

  const decision = chooseRoute(verb, {
    displayName: name,
    phone: str(input.phone) || null,
    isBuntyUser: input.is_bunty_user === true,
    pairedPeerId: str(input.paired_peer_id) || null,
  });
  if (!decision.ok) return { content: explainRefusal(decision.reason, name), isError: false, yieldToUser: true };

  const plan = newPlan(
    {
      contactName: name,
      route: decision.route,
      phone: decision.phone,
      peerId: decision.peerId,
      message,
      notifyRouter: decision.notifyRouter,
    },
    (deps.now ?? Date.now)(),
  );
  deps.plans.save(plan);
  return {
    content:
      `Read this to the owner exactly and wait for their answer:\n${readBack(plan)}\n\n` +
      `plan_id: ${plan.id}\n` +
      `If they say go, call reach_contact with this plan_id. If they want a change, make a new plan.`,
    isError: false,
    yieldToUser: true,
  };
}

/** What the model must do next to actually send it, through Vellum's own tools. */
export function dispatchInstruction(p: ReachPlan): string {
  switch (p.route) {
    case "call":
      return `Now call call_start with phone_number "${p.phone}" and task "Tell ${p.contactName}: ${p.message}". Keep the AI disclosure on. Afterwards tell the owner how the call went.`;
    case "whatsapp":
      return `Now call messaging_send with platform "whatsapp", conversation_id "${p.phone!.replace(/^\+/, "")}" and text "${p.message}". Afterwards tell the owner it was sent.`;
    case "a2a_note":
      return `Now call a2a_send_note with peer_id "${p.peerId}" and text "${p.message}".`;
    case "a2a_task":
      return `Now call a2a_send_task with peer_id "${p.peerId}" and description "${p.message}".`;
  }
}

export async function sendPlan(
  input: Record<string, unknown>,
  ctx: { approvedViaPrompt?: boolean },
  deps: CoreDeps,
): Promise<Result> {
  // Gate checked in code (decision D-09): the owner must have approved this exact call.
  if (ctx.approvedViaPrompt !== true) {
    return {
      content:
        "Not sent: the owner has to approve this step in the approval prompt. If 'always allow' is on for reach_contact, turn it off so each send is approved.",
      isError: true,
    };
  }
  const checked = checkPlanForSend(deps.plans, str(input.plan_id), (deps.now ?? Date.now)());
  if (!checked.ok) return { content: `Not sent: ${checked.error}`, isError: true };
  const plan = checked.plan;
  deps.plans.markUsed(plan.id, (deps.now ?? Date.now)());

  let hintNote = "";
  if (plan.notifyRouter && plan.phone) {
    try {
      await deps.hints.sendHint(deps.assistantId, plan.phone);
    } catch (err) {
      hintNote = ` (Note: could not tell the router, so ${plan.contactName}'s reply may not come back here: ${String(err)})`;
    }
  }
  return { content: dispatchInstruction(plan) + hintNote, isError: false };
}
