// Starts the deadline-sweep timer when the assistant loads this plugin. Never throws:
// a throw here would stop the whole plugin from loading.
import type { InitContext } from "@vellumai/plugin-api";
import { startDeadlineTimer } from "../src/deadline-timer.ts";
import { getService } from "../src/runtime.ts";

export default async function init(ctx: InitContext): Promise<void> {
  startDeadlineTimer({
    sweep: async () => (await getService()).deadlineSweep(),
    log: (msg, fields) => ctx.logger.info(fields ?? {}, msg),
  });
}
