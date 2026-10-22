/**
 * User-facing product name, plus a last-line safety net that swaps a leftover
 * "Vellum" for it in text about to be sent on WhatsApp or spoken on a call.
 *
 * Only prose is changed. Code fences, inline code, URLs, domains and
 * identifiers (`@vellumai/...`, `VELLUM_*`, `X-Vellum-*`, `vellum://`) pass
 * through untouched, and so does lowercase `vellum`, which in outgoing text is
 * the CLI command or an identifier rather than the product name.
 */

export const BRAND_NAME = "Bunty";

/** Spans that must reach the user exactly as written. */
const PROTECTED_SPAN =
  /```[\s\S]*?```|`[^`\n]*`|\b[a-z][a-z0-9+.-]*:\/\/\S+|\bwww\.\S+|[\w.-]*vellum\.[a-z]{2,}\S*/gi;

// Boundaries check ASCII only, so the name is still found next to CJK text ("登录Vellum").
const LATIN_NAME = /(?<![A-Za-z0-9_@./\\]|X-)(Vellum|VELLUM)(?![A-Za-z0-9_/\\])(?!\.[A-Za-z0-9])/gu;
const HINDI_NAME = /(?<![\p{L}\p{M}])वे(?:ल्ल|ल)म(?![\p{L}\p{M}])/gu;
const GUJARATI_NAME = /(?<![\p{L}\p{M}])વે(?:લ્લ|લ)મ(?![\p{L}\p{M}])/gu;

function rebrandProse(text: string): string {
  return text
    .replace(LATIN_NAME, (m) => (m === "VELLUM" ? BRAND_NAME.toUpperCase() : BRAND_NAME))
    .replace(HINDI_NAME, "बंटी")
    .replace(GUJARATI_NAME, "બંટી");
}

/** Returns `text` with the product name in prose replaced by {@link BRAND_NAME}. */
export function applyBrand(text: string): string {
  if (!/vellum|वे(?:ल्ल|ल)म|વે(?:લ્લ|લ)મ/i.test(text)) {
    return text;
  }
  let out = "";
  let last = 0;
  for (const match of text.matchAll(PROTECTED_SPAN)) {
    out += rebrandProse(text.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + rebrandProse(text.slice(last));
}
