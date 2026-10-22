// TwiML responses for incoming calls.

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "content-type": "text/xml" },
  });
}

/** Hands the call to the assistant's gateway. Twilio re-signs the request for the new URL. */
export function redirectTo(url: string): Response {
  return twiml(`<Redirect method="POST">${escapeXml(url)}</Redirect>`);
}

/** Short spoken message, then hang up. Used for unknown callers. */
export function sayAndHangUp(text: string): Response {
  return twiml(`<Say>${escapeXml(text)}</Say><Hangup/>`);
}
