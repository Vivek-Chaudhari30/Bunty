// Task lifecycle on the assignee side (protocol section 5).
import { TERMINAL_STATES, type TaskState } from "./types.ts";

const ALLOWED: Record<TaskState, TaskState[]> = {
  submitted: ["input_required", "completed", "canceled"],
  input_required: ["working", "rejected", "completed", "canceled", "input_required"],
  working: ["working", "input_required", "failed", "canceled"],
  completed: [],
  failed: [],
  canceled: [],
  rejected: [],
};

export function canMove(from: TaskState, to: TaskState): boolean {
  return ALLOWED[from].includes(to);
}

export function isTerminal(s: TaskState): boolean {
  return TERMINAL_STATES.has(s);
}

export class TransitionError extends Error {
  constructor(from: TaskState, to: TaskState) {
    super(`task cannot move from ${from} to ${to}`);
    this.name = "TransitionError";
  }
}

export function assertMove(from: TaskState, to: TaskState): void {
  if (!canMove(from, to)) throw new TransitionError(from, to);
}
