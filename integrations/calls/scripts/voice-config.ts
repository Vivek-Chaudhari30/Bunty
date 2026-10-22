// Prints the voice config commands for India. Add --apply to run them against the
// local assistant (needs the `assistant` CLI on PATH).
//
//   ELEVENLABS_VOICE_HI=<voice id> bun integrations/calls/scripts/voice-config.ts [--apply]
import { voiceConfigCommands } from "../src/voice-config.ts";

const cmds = voiceConfigCommands(process.env);
const apply = process.argv.includes("--apply");
for (const cmd of cmds) {
  console.log(cmd);
  if (apply) {
    const proc = Bun.spawnSync(["sh", "-c", cmd], { stdout: "inherit", stderr: "inherit" });
    if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1);
  }
}
if (!apply) console.log("\n(dry run: add --apply to run these)");
