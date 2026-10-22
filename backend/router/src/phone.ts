// Phone number helpers. Everything is stored in E.164 ("+910000000001").

/**
 * Normalizes a phone number to E.164. Accepts "+91 00000 00001", "910000000001"
 * (WhatsApp sends digits without "+") and "whatsapp:+91..." (Twilio style).
 * A bare 10-digit number is treated as Indian (+91). Returns null if unusable.
 */
export function toE164(raw: string): string | null {
  let s = raw.trim().replace(/^whatsapp:/i, "").replace(/^tel:/i, "");
  const hadPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (s.startsWith("00")) s = s.slice(2);
  if (!hadPlus && s.length === 10) s = "91" + s;
  if (s.length < 8 || s.length > 15 || s.startsWith("0")) return null;
  return "+" + s;
}

/** For logs: never print a full number. "+910000000001" -> "***0001". */
export function last4(e164: string): string {
  return "***" + e164.slice(-4);
}
