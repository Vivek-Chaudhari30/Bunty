// Adds or updates a user row (phone -> their assistant) through the router's signed
// internal endpoint. Used during onboarding until the website does it.
//
//   ROUTER_INTERNAL_HMAC_KEY=... bun backend/router/scripts/add-user.ts \
//     http://localhost:8787 "+91 00000 00001" chintu https://chintu.example.com
import { signInternal } from "../src/signatures.ts";

const [routerUrl, phone, assistantId, assistantBaseUrl] = process.argv.slice(2);
const key = process.env.ROUTER_INTERNAL_HMAC_KEY;
if (!routerUrl || !phone || !assistantId || !assistantBaseUrl || !key) {
  console.error("usage: ROUTER_INTERNAL_HMAC_KEY=... add-user.ts <router-url> <phone> <assistant-id> <assistant-base-url>");
  process.exit(1);
}
const body = JSON.stringify({ phone, assistantId, assistantBaseUrl });
const ts = Math.floor(Date.now() / 1000);
const res = await fetch(`${routerUrl.replace(/\/+$/, "")}/internal/users`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-bunty-timestamp": String(ts), "x-bunty-signature": signInternal(body, ts, key) },
  body,
});
console.log(res.status, await res.text());
