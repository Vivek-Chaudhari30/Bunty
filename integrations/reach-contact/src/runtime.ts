// Real dependencies inside a running assistant. Tests use their own.
import { join } from "node:path";
import type { CoreDeps } from "./core.ts";
import { FilePlanStore } from "./plan.ts";
import { createRouterHintClient } from "./router-hint.ts";

let cached: CoreDeps | null = null;

export async function runtimeDeps(): Promise<CoreDeps> {
  if (cached) return cached;
  const { getWorkspaceDir } = await import("@vellumai/plugin-api");
  cached = {
    plans: new FilePlanStore(join(getWorkspaceDir(), "plugins", "reach-contact", "data")),
    hints: createRouterHintClient(process.env),
    assistantId: process.env.BUNTY_ASSISTANT_ID ?? "unknown",
  };
  return cached;
}
