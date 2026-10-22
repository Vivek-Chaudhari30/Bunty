// Decides how to reach someone: phone call, WhatsApp, or their assistant (A2A).
// Pure function; the rules are integrations/reach-contact/README.md "Decision order".
import { isEmergency, toE164 } from "./phone.ts";

/** What the owner asked for, in their words: "call", "text"/"WhatsApp", "tell", or work to do. */
export type Verb = "call" | "text" | "tell" | "task";

export type Route = "call" | "whatsapp" | "a2a_note" | "a2a_task";

export interface ContactFacts {
  displayName: string;
  phone?: string | null;
  /** True when the contact has their own Bunty assistant (is in the router's users). */
  isBuntyUser?: boolean;
  /** Our A2A peer id for their assistant, when paired (integrations/a2a-delegation). */
  pairedPeerId?: string | null;
}

export type Decision =
  | { ok: true; route: Route; phone: string | null; peerId: string | null; notifyRouter: boolean }
  | { ok: false; reason: "emergency_number" | "no_phone" | "bad_phone" | "not_paired" | "user_not_paired" };

export function chooseRoute(verb: Verb, c: ContactFacts): Decision {
  const phone = c.phone ? toE164(c.phone) : null;
  if (c.phone && isEmergency(c.phone)) return { ok: false, reason: "emergency_number" };
  if (c.phone && !phone) return { ok: false, reason: "bad_phone" };
  const peerId = c.pairedPeerId ?? null;

  const viaPhone = (route: "call" | "whatsapp"): Decision =>
    phone
      ? { ok: true, route, phone, peerId: null, notifyRouter: !c.isBuntyUser }
      : { ok: false, reason: "no_phone" };

  switch (verb) {
    case "call":
      return viaPhone("call");
    case "text":
      // Text to another Bunty user goes assistant to assistant: a WhatsApp from the
      // shared number would come back to their own assistant, not ours (decision D-05).
      if (c.isBuntyUser) {
        return peerId
          ? { ok: true, route: "a2a_note", phone: null, peerId, notifyRouter: false }
          : { ok: false, reason: "user_not_paired" };
      }
      return viaPhone("whatsapp");
    case "task":
      return peerId
        ? { ok: true, route: "a2a_task", phone: null, peerId, notifyRouter: false }
        : { ok: false, reason: "not_paired" };
    case "tell":
      if (peerId) return { ok: true, route: "a2a_note", phone: null, peerId, notifyRouter: false };
      if (c.isBuntyUser) return { ok: false, reason: "user_not_paired" };
      if (phone) return { ok: true, route: "whatsapp", phone, peerId: null, notifyRouter: true };
      return { ok: false, reason: "no_phone" };
  }
}

/** What to tell the owner when no route works. */
export function explainRefusal(reason: Exclude<Decision, { ok: true }>["reason"], name: string): string {
  switch (reason) {
    case "emergency_number":
      return "I can't call or message emergency numbers. Please dial it yourself.";
    case "no_phone":
      return `I don't have a phone number for ${name}. What is it?`;
    case "bad_phone":
      return `That number for ${name} doesn't look right. Can you say it again with the country code?`;
    case "not_paired":
      return `${name}'s assistant isn't connected to me yet, so I can't send them a task. I can call or WhatsApp ${name} instead, or you can connect our assistants first.`;
    case "user_not_paired":
      return `${name} has their own assistant, but it isn't connected to me yet. Shall I call ${name} instead, or connect our assistants first?`;
  }
}
