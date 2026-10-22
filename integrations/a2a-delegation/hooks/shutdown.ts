// Stops the deadline-sweep timer when the assistant unloads this plugin.
import { stopDeadlineTimer } from "../src/deadline-timer.ts";

export default async function shutdown(): Promise<void> {
  stopDeadlineTimer();
}
