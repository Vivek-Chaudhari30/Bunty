#!/usr/bin/env bun
/**
 * Fails when "Vellum" appears in text a user can see or hear.
 *
 * Usage:
 *   bun infra/scripts/check-brand.ts            # check; exit 1 on any new hit
 *   bun infra/scripts/check-brand.ts --list     # print every hit and its status
 *
 * What it scans: Vellum's assistant, gateway, CLI, web client, skills, meta
 * catalogs and credential executor, plus our integrations/ and the Bunty
 * identity text. Tests, stories and node_modules are skipped.
 *
 * What counts as a hit (same rules as docs/architecture/bunty-branding-inventory.md):
 * the word "Vellum" on its own (not `@vellumai/...`, `VELLUM_*`, `X-Vellum-*`,
 * `VellumProvider`, `Vellum.method`, a path or a URL), outside comment, import
 * and logger lines. In Markdown, text inside backticks is code and is skipped.
 *
 * Every hit must be listed in check-brand.allow.json:
 * - "internal": names that must stay (identifiers, developer docs, licence).
 * - "pending":  AI-facing text (skills, tool text) still to be reworded; the
 *               bunty-brand plugin and the outgoing-text safety net cover it at
 *               runtime. This list may only shrink.
 * Anything else fails: a user-facing "Vellum" came back or was added.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(import.meta.path), "../..");

const ROOTS = [
  "vellum/assistant/src",
  "vellum/gateway/src",
  "vellum/cli/src",
  "vellum/credential-executor/src",
  "vellum/clients/web/src",
  "vellum/clients/web/index.html",
  "vellum/clients/web/capacitor.config.ts",
  "vellum/skills",
  "vellum/meta",
  "integrations",
  "infra/scripts/bunty-identity",
];
const EXTENSIONS = [".ts", ".tsx", ".md", ".json", ".html"];
const SKIP_PATH = /node_modules|\.test\.|__tests__|\/tests?\/|\.stories\./;

/** The product name as a word: not part of an identifier, path, header or method. */
const WORD = /(?<![A-Za-z0-9_@./\\$-])(?<!X-)Vellum(?![A-Za-z0-9_/\\-])(?!\.[A-Za-z0-9])/;
const URL_SPAN = /\b[a-z][a-z0-9+.-]*:\/\/\S+|\bwww\.\S+|[\w.-]*vellum\.[a-z]{2,}\S*/gi;
const BACKTICK_SPAN = /`[^`\n]*`/g;
const LOGGER_CALL = /\blog(ger)?\.(info|warn|error|debug)\(/;

export interface Hit {
  file: string;
  line: number;
  text: string;
}

/** Key used in the allow list: file plus the trimmed line, cut at 150 characters. */
export function hitKey(file: string, text: string): string {
  return `${file}|${text.trim().slice(0, 150)}`;
}

/** Returns true when this line shows the product name to a user. */
export function lineHasBrand(file: string, line: string): boolean {
  const trimmed = line.trim();
  if (!file.endsWith(".md") && !file.endsWith(".json") && !file.endsWith(".html")) {
    if (/^(\/\/|\*|\/\*|import |export \* from)/.test(trimmed)) {
      return false;
    }
    if (LOGGER_CALL.test(trimmed)) {
      return false;
    }
  }
  let text = line.replace(URL_SPAN, "");
  if (file.endsWith(".md")) {
    text = text.replace(BACKTICK_SPAN, "");
  }
  return WORD.test(text);
}

function walk(path: string, out: string[]): void {
  const full = join(REPO_ROOT, path);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    for (const name of readdirSync(full)) {
      walk(join(path, name), out);
    }
  } else if (EXTENSIONS.some((ext) => path.endsWith(ext)) && !SKIP_PATH.test(path)) {
    out.push(path);
  }
}

export function findHits(): Hit[] {
  const files: string[] = [];
  for (const root of ROOTS) {
    walk(root, files);
  }
  const hits: Hit[] = [];
  for (const file of files) {
    const content = readFileSync(join(REPO_ROOT, file), "utf-8");
    if (!content.includes("Vellum")) {
      continue;
    }
    content.split("\n").forEach((text, i) => {
      if (lineHasBrand(file, text)) {
        hits.push({ file, line: i + 1, text });
      }
    });
  }
  return hits;
}

interface AllowList {
  internal: string[];
  pending: string[];
}

function main(): void {
  const allowPath = join(REPO_ROOT, "infra/scripts/check-brand.allow.json");
  const allow: AllowList = JSON.parse(readFileSync(allowPath, "utf-8"));
  const internal = new Set(allow.internal);
  const pending = new Set(allow.pending);
  const hits = findHits();
  const list = process.argv.includes("--list");

  const bad: Hit[] = [];
  let counts = { internal: 0, pending: 0 };
  for (const hit of hits) {
    const key = hitKey(hit.file, hit.text);
    const status = internal.has(key) ? "internal" : pending.has(key) ? "pending" : "FAIL";
    if (status === "FAIL") {
      bad.push(hit);
    } else {
      counts[status]++;
    }
    if (list) {
      console.log(`${status.padEnd(8)} ${hit.file}:${hit.line}  ${hit.text.trim().slice(0, 120)}`);
    }
  }

  console.log(
    `check-brand: ${hits.length} "Vellum" lines scanned; ${counts.internal} internal, ${counts.pending} pending AI text, ${bad.length} not allowed.`,
  );
  if (bad.length > 0) {
    console.error('\nUser-facing "Vellum" found. Change it to Bunty (BRAND_NAME), or, if it is an identifier, add it to "internal" in infra/scripts/check-brand.allow.json:\n');
    for (const hit of bad) {
      console.error(`  ${hit.file}:${hit.line}  ${hit.text.trim().slice(0, 140)}`);
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
