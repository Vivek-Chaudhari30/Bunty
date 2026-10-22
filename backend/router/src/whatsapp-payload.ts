// Reads who a Meta WhatsApp webhook is about, and splits a batched webhook
// into one payload per counterparty number.
import { toE164 } from "./phone.ts";

interface ChangeValue {
  messages?: Array<{ from?: string; [k: string]: unknown }>;
  statuses?: Array<{ recipient_id?: string; [k: string]: unknown }>;
  contacts?: Array<{ wa_id?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}
interface Change {
  field?: string;
  value?: ChangeValue;
}
interface Entry {
  id?: string;
  changes?: Change[];
}
export interface MetaWebhook {
  object?: string;
  entry?: Entry[];
}

/**
 * The person on the other side of each item: `from` for an incoming message,
 * `recipient_id` for a delivery status of a message we sent.
 */
function counterpartyOf(item: { from?: string; recipient_id?: string }): string | null {
  const raw = item.from ?? item.recipient_id;
  return raw ? toE164(raw) : null;
}

/** All distinct counterparty numbers in the webhook, in order. */
export function counterparties(payload: MetaWebhook): string[] {
  const seen = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const item of [...(change.value?.messages ?? []), ...(change.value?.statuses ?? [])]) {
        const n = counterpartyOf(item);
        if (n) seen.add(n);
      }
    }
  }
  return [...seen];
}

/** Payload with only the messages and statuses about one counterparty. */
export function payloadFor(payload: MetaWebhook, counterparty: string): MetaWebhook {
  const keep = (item: { from?: string; recipient_id?: string }) => counterpartyOf(item) === counterparty;
  return {
    ...payload,
    entry: (payload.entry ?? [])
      .map((entry) => ({
        ...entry,
        changes: (entry.changes ?? [])
          .map((change) => {
            const v = change.value ?? {};
            const messages = (v.messages ?? []).filter(keep);
            const statuses = (v.statuses ?? []).filter(keep);
            const out: ChangeValue = { ...v };
            if (v.messages) out.messages = messages;
            if (v.statuses) out.statuses = statuses;
            if (v.contacts) out.contacts = v.contacts.filter((c) => (c.wa_id ? toE164(c.wa_id) === counterparty : false));
            return { ...change, value: out, _empty: messages.length === 0 && statuses.length === 0 };
          })
          .filter((c) => !c._empty)
          .map(({ _empty, ...c }) => c),
      }))
      .filter((e) => e.changes.length > 0),
  };
}

/** True if the webhook carries at least one incoming message (not only statuses). */
export function hasIncomingMessage(payload: MetaWebhook, counterparty: string): boolean {
  return (payload.entry ?? []).some((e) =>
    (e.changes ?? []).some((c) => (c.value?.messages ?? []).some((m) => counterpartyOf(m) === counterparty)),
  );
}
