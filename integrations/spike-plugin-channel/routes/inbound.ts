// Spike A: the gateway has already checked the HMAC before this runs.
// We return the inbound envelope; the gateway then runs a turn for the sender.
import { parseDelivery, toEnvelope } from "../src/envelope.ts";

export async function POST(request: Request): Promise<Response> {
  const delivery = parseDelivery(await request.json().catch(() => null));
  if (!delivery) {
    return Response.json({ error: "need text, from, chatId, messageId" }, { status: 400 });
  }
  return Response.json(toEnvelope(delivery));
}
