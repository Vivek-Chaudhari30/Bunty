// Writes infra/Caddyfile from infra/assistants.json.
//   bun backend/deploy/scripts/gen-caddyfile.ts [infra/assistants.json] [infra/Caddyfile]
import { assistantBaseUrl, buildCaddyfile, type DeployConfig } from "../src/caddyfile.ts";

const [input = "infra/assistants.json", output = "infra/Caddyfile"] = process.argv.slice(2);
const config = (await Bun.file(input).json()) as DeployConfig;
await Bun.write(output, buildCaddyfile(config));
console.log(`wrote ${output}`);
for (const a of config.assistants) console.log(`  ${a.id}: ${assistantBaseUrl(config, a.id)}`);
