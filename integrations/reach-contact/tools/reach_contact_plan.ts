// Step 1: work out how to reach someone and read the plan back. Sends nothing.
import type { ToolContext, ToolExecutionResult } from "@vellumai/plugin-api";
import { makePlan } from "../src/core.ts";
import { runtimeDeps } from "../src/runtime.ts";

export default {
  description:
    "Plan how to reach a person for the owner: 'call X', 'text/WhatsApp X', 'tell X that ...', or give X's assistant a task. " +
    "Resolve the person with contact_search first and pass what you found. Sends nothing: it returns a read-back for the owner " +
    "and a plan_id. Only the owner may ask for this.",
  defaultRiskLevel: "low" as const,
  input_schema: {
    type: "object",
    properties: {
      verb: { type: "string", enum: ["call", "text", "tell", "task"], description: "What the owner asked: call, text (WhatsApp), tell, or task (work for their assistant)." },
      contact_name: { type: "string", description: "The person's name as the owner knows them." },
      phone: { type: "string", description: "Their phone number, if known. E.164 preferred; +91 is assumed for 10 digits." },
      is_bunty_user: { type: "boolean", description: "True if this person has their own Bunty assistant." },
      paired_peer_id: { type: "string", description: "Their assistant's peer id from a2a_task_status, if paired." },
      message: { type: "string", description: "The exact words to pass on, in the owner's language." },
    },
    required: ["verb", "contact_name", "message"],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    if (ctx.trustClass !== "guardian") {
      return { content: "Only the owner can ask me to contact someone.", isError: true };
    }
    return makePlan(input, await runtimeDeps());
  },
};
