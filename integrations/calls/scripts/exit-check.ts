// Phase 4 exit check. Record each test call as a line "ok,first_reply_ms,language"
// (for example "1,1800,hi" or "0,,gu"), then:
//   bun integrations/calls/scripts/exit-check.ts calls.csv
import { checkCalls, parseCallsCsv } from "../src/exit-check.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: exit-check.ts <calls.csv>");
  process.exit(1);
}
const result = checkCalls(parseCallsCsv(await Bun.file(file).text()));
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
