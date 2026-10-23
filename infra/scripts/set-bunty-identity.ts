#!/usr/bin/env bun
/**
 * Makes an assistant workspace start as Bunty.
 *
 * Usage:
 *   bun infra/scripts/set-bunty-identity.ts [--workspace <dir>] [--dry-run]
 *
 * Workspace: --workspace, else $VELLUM_WORKSPACE_DIR, else ~/.vellum/workspace.
 *
 * What it does, in order:
 * 1. IDENTITY.md: missing -> write infra/scripts/bunty-identity/IDENTITY.md.
 *    Present -> set the Name, Emoji, Nature, Personality and Role lines and
 *    keep everything else (for example the Avatar section).
 * 2. SOUL.md: missing -> Vellum's SOUL.md template. Then the "## Personality"
 *    section (up to the next "## " heading) is replaced with
 *    bunty-identity/PERSONALITY.md. Every other section is kept.
 * 3. Fresh workspace only (no IDENTITY.md and no SOUL.md before this run):
 *    copy Vellum's BOOTSTRAP.md and BOOTSTRAP-REFERENCE.md. The daemon only
 *    seeds these when neither prompt file exists, so pre-writing the prompt
 *    files would otherwise skip the first-conversation flow.
 *
 * Any file it changes is first copied to <workspace>/.bunty-backups/<time>/.
 * Running it twice changes nothing the second time. Run it before the first
 * `vellum wake` for a new assistant, or any time for an existing one (the
 * daemon reloads IDENTITY.md and SOUL.md when they change).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(import.meta.path), "../..");
const BUNTY_DIR = join(REPO_ROOT, "infra/scripts/bunty-identity");
const VELLUM_TEMPLATES = join(
  REPO_ROOT,
  "vellum/assistant/src/prompts/templates",
);

const IDENTITY_FIELDS = ["Name", "Emoji", "Nature", "Personality", "Role"];

function parseArgs(argv: string[]): { workspace: string; dryRun: boolean } {
  let workspace =
    process.env.VELLUM_WORKSPACE_DIR ?? join(homedir(), ".vellum/workspace");
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === "--workspace" && next) {
      workspace = next;
      i++;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    } else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  return { workspace: resolve(workspace), dryRun };
}

function fieldLine(content: string, field: string): string | undefined {
  return content.match(new RegExp(`^- \\*\\*${field}:\\*\\*.*$`, "m"))?.[0];
}

/** Sets the five identity lines in an existing IDENTITY.md, keeping the rest. */
export function mergeIdentity(current: string, bunty: string): string {
  let out = current;
  for (const field of IDENTITY_FIELDS) {
    const wanted = fieldLine(bunty, field);
    if (!wanted) {
      continue;
    }
    const existing = fieldLine(out, field);
    if (existing) {
      out = out.replace(existing, () => wanted);
    } else {
      // Add missing fields after the last field line, or after the heading.
      const lines = out.split("\n");
      let at = -1;
      lines.forEach((l, i) => {
        if (/^- \*\*\w+:\*\*/.test(l)) {
          at = i;
        }
      });
      if (at === -1) {
        at = lines.findIndex((l) => l.startsWith("# "));
      }
      lines.splice(at + 1, 0, wanted);
      out = lines.join("\n");
    }
  }
  return out;
}

/** Replaces the "## Personality" section of SOUL.md with Bunty's. */
export function mergePersonality(soul: string, personality: string): string {
  const block = personality.trimEnd() + "\n\n";
  const lines = soul.split("\n");
  const start = lines.findIndex((l) => l.trim() === "## Personality");
  if (start === -1) {
    const working = lines.findIndex((l) => l.startsWith("## Working with"));
    if (working === -1) {
      return soul.trimEnd() + "\n\n" + block;
    }
    return [
      ...lines.slice(0, working),
      ...block.split("\n").slice(0, -1),
      ...lines.slice(working),
    ].join("\n");
  }
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end === -1) {
    end = lines.length;
  }
  return [
    ...lines.slice(0, start),
    ...block.split("\n").slice(0, -1),
    ...lines.slice(end),
  ].join("\n");
}

function main(): void {
  const { workspace, dryRun } = parseArgs(process.argv.slice(2));
  if (!existsSync(workspace)) {
    console.error(`Workspace not found: ${workspace}`);
    process.exit(1);
  }

  const identityPath = join(workspace, "IDENTITY.md");
  const soulPath = join(workspace, "SOUL.md");
  const fresh = !existsSync(identityPath) && !existsSync(soulPath);
  const buntyIdentity = readFileSync(join(BUNTY_DIR, "IDENTITY.md"), "utf-8");
  const personality = readFileSync(join(BUNTY_DIR, "PERSONALITY.md"), "utf-8");

  const writes: Array<{ path: string; content: string }> = [];

  const identity = existsSync(identityPath)
    ? mergeIdentity(readFileSync(identityPath, "utf-8"), buntyIdentity)
    : buntyIdentity;
  writes.push({ path: identityPath, content: identity });

  const soulBase = existsSync(soulPath)
    ? readFileSync(soulPath, "utf-8")
    : readFileSync(join(VELLUM_TEMPLATES, "SOUL.md"), "utf-8");
  writes.push({ path: soulPath, content: mergePersonality(soulBase, personality) });

  if (fresh) {
    for (const file of ["BOOTSTRAP.md", "BOOTSTRAP-REFERENCE.md"]) {
      const dest = join(workspace, file);
      if (!existsSync(dest)) {
        writes.push({
          path: dest,
          content: readFileSync(join(VELLUM_TEMPLATES, file), "utf-8"),
        });
      }
    }
  }

  const backupDir = join(
    workspace,
    ".bunty-backups",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  let changed = 0;
  for (const { path, content } of writes) {
    const before = existsSync(path) ? readFileSync(path, "utf-8") : null;
    if (before === content) {
      console.log(`unchanged  ${path}`);
      continue;
    }
    changed++;
    console.log(`${before === null ? "create   " : "update   "}  ${path}`);
    if (dryRun) {
      continue;
    }
    if (before !== null) {
      mkdirSync(backupDir, { recursive: true });
      copyFileSync(path, join(backupDir, basename(path)));
    }
    writeFileSync(path, content, "utf-8");
  }
  console.log(
    dryRun
      ? `Dry run: ${changed} file(s) would change.`
      : `Done: ${changed} file(s) changed.${changed && existsSync(backupDir) ? ` Backups in ${backupDir}` : ""}`,
  );
}

if (import.meta.main) {
  main();
}
