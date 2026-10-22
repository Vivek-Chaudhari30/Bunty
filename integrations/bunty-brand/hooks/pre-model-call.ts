// Adds the Bunty brand rules to the system prompt of every user-facing model call.
// Never throws: Vellum would log it and send the original prompt.
import type { PreModelCallContext } from "@vellumai/plugin-api";
import { withBrandRules } from "../src/brand-rules.ts";

export default function preModelCall(ctx: PreModelCallContext): void {
  ctx.systemPrompt = withBrandRules(ctx.systemPrompt, ctx.callSite);
}
