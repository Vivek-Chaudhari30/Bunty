// Sends one fake, correctly signed WhatsApp webhook to a gateway or the router.
// Only for your own local assistant or router: it never contacts Meta or a real person.
//
//   WHATSAPP_APP_SECRET=... bun integrations/whatsapp/scripts/send-test-webhook.ts \
//     http://localhost:7830/webhooks/whatsapp text 910000000001 "remind me at 7 PM"
//
// kind: text | audio | image | document | button. Media kinds carry fake media ids,
// so the gateway's media download from Meta fails until real keys exist.
import { buildSignedRequest, type TestMessageKind } from "../src/test-webhook.ts";

const [url, kind = "text", from = "910000000001", text] = process.argv.slice(2);
const secret = process.env.WHATSAPP_APP_SECRET;
if (!url || !secret) {
  console.error("usage: WHATSAPP_APP_SECRET=... send-test-webhook.ts <url> [kind] [from] [text]");
  process.exit(1);
}
const res = await fetch(buildSignedRequest(url, { kind: kind as TestMessageKind, from, text }, secret));
console.log(res.status, await res.text());
