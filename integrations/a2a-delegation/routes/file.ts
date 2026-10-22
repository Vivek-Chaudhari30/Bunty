// GET /webhooks/plugins/a2a-delegation/file?id=...&exp=...&sig=... (large result files).
import { dispatch } from "../src/http.ts";
import { getService } from "../src/runtime.ts";

export async function GET(request: Request): Promise<Response> {
  return dispatch(await getService(), "file", request);
}
