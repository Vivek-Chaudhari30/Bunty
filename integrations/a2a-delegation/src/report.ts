// Plain-text overview for the owner (a2a_task_status).
import type { A2ADb } from "./db.ts";

export function statusReport(db: A2ADb, taskId?: string): string {
  const inbound = db.listInbound().filter((t) => !taskId || t.task_id === taskId);
  const outbound = db.listOutbound().filter((t) => !taskId || t.task_id === taskId);
  const lines: string[] = [];
  if (!taskId) {
    const peers = db.listPeers();
    lines.push(
      peers.length
        ? "Connected assistants:\n" + peers.map((p) => `- ${p.peer_id}: ${p.owner_name}'s assistant ${p.display_name} (${p.status})`).join("\n")
        : "No connected assistants yet.",
    );
  }
  if (outbound.length) {
    lines.push(
      "Sent by us:\n" +
        outbound
          .slice(0, 20)
          .map((t) => `- ${t.task_id} to ${t.peer_id}: ${t.task_type} "${t.summary}" -> ${t.state}${t.waiting_on ? ` (waiting on ${t.waiting_on})` : ""}${t.due_by ? `, due ${t.due_by}` : ""}`)
          .join("\n"),
    );
  }
  if (inbound.length) {
    lines.push(
      "Received:\n" +
        inbound
          .slice(0, 20)
          .map((t) => `- ${t.task_id} from ${t.peer_id}: ${t.task_type} -> ${t.state}${t.waiting_on ? ` (waiting on ${t.waiting_on})` : ""}${t.due_by ? `, due ${t.due_by}` : ""}`)
          .join("\n"),
    );
  }
  if (taskId && !inbound.length && !outbound.length) return `No task ${taskId}.`;
  return lines.join("\n\n");
}
