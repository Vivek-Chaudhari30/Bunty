// Phone numbers: E.164 normalization and numbers we must never call or text.

/**
 * Emergency and helpline numbers. Vellum's own list (vellum/assistant/src/calls/call-constants.ts)
 * plus India's: police 100, fire 101, ambulance 102 and 108, women 1091, children 1098.
 */
const EMERGENCY = new Set(["911", "112", "999", "000", "110", "119", "100", "101", "102", "108", "1091", "1098"]);

/** "+91 00000 00001", "00000 00001", "910000000001" -> "+910000000001". Bare 10 digits = India. */
export function toE164(raw: string, defaultCountry = "91"): string | null {
  const hadPlus = raw.trim().startsWith("+");
  let d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!hadPlus && d.length === 11 && d.startsWith("0")) d = d.slice(1); // "0" trunk prefix, Indian style
  if (!hadPlus && d.length === 10) d = defaultCountry + d;
  if (d.length < 8 || d.length > 15 || d.startsWith("0")) return null;
  return "+" + d;
}

/** True for an emergency or helpline number, bare or with a 1-3 digit country code. */
export function isEmergency(raw: string): boolean {
  const d = raw.replace(/[^\d]/g, "");
  if (EMERGENCY.has(d)) return true;
  for (let cc = 1; cc <= 3; cc++) {
    if (EMERGENCY.has(d.slice(cc))) return true;
  }
  return false;
}
