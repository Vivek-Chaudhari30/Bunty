// POST /webhooks/plugins/a2a-delegation/unpair. The gateway has already checked the
// request (see channels/ingress.json); the service checks the per-peer signature.
import { dispatch } from "../src/http.ts";
import { getService } from "../src/runtime.ts";

export async function POST(request: Request): Promise<Response> {
  return dispatch(await getService(), "unpair", request);
}
