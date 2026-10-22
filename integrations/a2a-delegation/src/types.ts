// A2A v1 shapes, copied from vellum/assistant/src/a2a/protocol-types.ts (snake_case
// field names, file bytes in `raw`), plus our bunty.delegation/v1 metadata.

export type TaskState = "submitted" | "working" | "completed" | "failed" | "canceled" | "input_required" | "rejected";

export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set(["completed", "failed", "canceled", "rejected"]);

export interface TextPart {
  kind: "text";
  text: string;
}
export interface DataPart {
  kind: "data";
  data: Record<string, unknown>;
  media_type?: string;
}
export interface FilePart {
  kind: "file";
  url?: string;
  /** base64 bytes, for files up to 5 MB */
  raw?: string;
  filename?: string;
  media_type?: string;
}
export type Part = TextPart | DataPart | FilePart;

export interface A2AMessage {
  message_id: string;
  context_id?: string;
  task_id?: string;
  role: "user" | "agent";
  parts: Part[];
  metadata?: Record<string, unknown>;
}

export interface TaskStatus {
  state: TaskState;
  message?: A2AMessage;
  timestamp: string;
}

export interface Artifact {
  artifact_id: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

export interface A2ATask {
  id: string;
  context_id?: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}

export const DELEGATION_KEY = "bunty.delegation/v1";
export const WAITING_ON_KEY = "bunty.waitingOn";

export type TaskType = "note" | "task";
export type WaitingOn = "assignee_owner_accept" | "assignee_owner_release" | "requester";

export interface Deliverable {
  title: string;
  format?: string;
}

export interface DelegationMeta {
  taskType: TaskType;
  requester: { assistant: string; owner: string };
  assignee: { owner: string };
  deliverables?: Deliverable[];
  dueBy?: string;
  acceptBy?: "assignee_owner";
  releaseBy?: "assignee_owner";
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: { message: A2AMessage };
}
