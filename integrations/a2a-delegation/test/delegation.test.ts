// The roadmap's Phase 7 scenario, end to end between Chintu and Sujal in one process:
// "Owner B, three presentations by tomorrow", with accept, decline, a question back,
// cancel, a missed deadline, and Gate C.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DelegationService } from "../src/delegation.ts";
import { hashResultFiles, manifestHash, safeFilename, WorkspaceFiles } from "../src/files.ts";
import { canMove } from "../src/state.ts";
import { makePair, pairUp, type Pair } from "./harness.ts";

const DUE = "2026-01-02T18:00:00+05:30";

function setup(): Pair & { workspace: string; chintuData: string } {
  const workspace = mkdtempSync(join(tmpdir(), "sujal-ws-"));
  const chintuData = mkdtempSync(join(tmpdir(), "chintu-data-"));
  mkdirSync(join(workspace, "decks"));
  for (const n of [1, 2, 3]) writeFileSync(join(workspace, "decks", `presentation-${n}.pptx`), `deck ${n} contents`);
  const p = makePair((deps) =>
    new DelegationService({
      ...deps,
      dataDir: deps.selfId === "chintu" ? chintuData : mkdtempSync(join(tmpdir(), "sujal-data-")),
      files: new WorkspaceFiles(workspace),
    }),
  );
  return { ...p, workspace, chintuData };
}

const svc = (s: { service: unknown }) => s.service as DelegationService;

async function sendDecks(p: Pair) {
  return svc(p.chintu).sendTask(
    "sujal",
    "Owner A asks Owner B to complete three presentations and send them back by tomorrow.",
    [{ title: "Presentation 1", format: "pptx" }, { title: "Presentation 2", format: "pptx" }, { title: "Presentation 3", format: "pptx" }],
    DUE,
  );
}

describe("state machine", () => {
  test("follows the protocol diagram", () => {
    expect(canMove("submitted", "input_required")).toBe(true);
    expect(canMove("input_required", "working")).toBe(true);
    expect(canMove("working", "completed")).toBe(false); // Gate C must be asked first
    expect(canMove("input_required", "completed")).toBe(true);
    expect(canMove("completed", "working")).toBe(false);
    expect(canMove("rejected", "working")).toBe(false);
  });
});

describe("delegation: three presentations by tomorrow", () => {
  test("full happy path: Gate A, a question back, Gate C, files reach Owner A", async () => {
    const p = setup();
    await pairUp(p);
    const sent = await sendDecks(p);
    expect(sent.status.state).toBe("input_required");

    // Owner B is asked (Gate A). Nothing is working yet.
    const ask = p.sujal.notifier.last();
    expect(ask).toContain("Owner A (through Owner A's assistant Chintu) is asking Owner B");
    expect(ask).toContain("Presentation 3 (pptx)");
    expect(ask).toContain(`Due by: ${DUE}`);
    expect(ask).toContain("accept_delegation");
    const inbound = p.sujal.db.listInbound()[0]!;
    expect(inbound).toMatchObject({ state: "input_required", waiting_on: "assignee_owner_accept", due_by: DUE });

    // Owner B accepts -> Owner A hears it.
    await svc(p.sujal).acceptDelegation(inbound.task_id, true);
    expect(p.chintu.notifier.last()).toContain("Owner B accepted the task");
    expect(p.chintu.db.getOutbound(sent.id)?.state).toBe("working");

    // Sujal asks a question back; Owner A answers.
    await svc(p.sujal).askRequester(inbound.task_id, "Which company template should the decks use?");
    expect(p.chintu.notifier.last()).toContain("Which company template");
    expect(p.chintu.db.getOutbound(sent.id)).toMatchObject({ state: "input_required", waiting_on: "requester" });
    await svc(p.chintu).answerQuestion(sent.id, "Use the blue one.");
    expect(p.sujal.notifier.last()).toContain("Use the blue one.");
    expect(p.sujal.db.getInbound(inbound.task_id)?.state).toBe("working");

    // Gate C: Owner B releases exactly these three files.
    const paths = [1, 2, 3].map((n) => `decks/presentation-${n}.pptx`);
    const released = await svc(p.sujal).releaseResult(inbound.task_id, paths, "All three decks.");
    expect(released.files).toBe(3);
    expect(p.sujal.db.getInbound(inbound.task_id)).toMatchObject({ state: "completed", approved_release_hash: released.hash });

    // Owner A gets the files.
    const done = p.chintu.notifier.last();
    expect(done).toContain("Owner B sent the results");
    expect(done).toContain("3 file(s)");
    const saved = JSON.parse(p.chintu.db.getOutbound(sent.id)!.result_files_json!) as string[];
    expect(saved.map((s) => s.split("/").pop())).toEqual(["presentation-1.pptx", "presentation-2.pptx", "presentation-3.pptx"]);
    expect(readFileSync(saved[1]!, "utf8")).toBe("deck 2 contents");
  });

  test("Owner B declines: Owner A hears the reason", async () => {
    const p = setup();
    await pairUp(p);
    const sent = await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, false, "Travelling tomorrow");
    expect(p.chintu.db.getOutbound(sent.id)?.state).toBe("rejected");
    expect(p.chintu.notifier.last()).toContain("declined");
    expect(p.chintu.notifier.last()).toContain("Travelling tomorrow");
  });

  test("nothing can be released before Owner B accepts", async () => {
    const p = setup();
    await pairUp(p);
    await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await expect(svc(p.sujal).releaseResult(t.task_id, ["decks/presentation-1.pptx"])).rejects.toThrow(/nothing to release/);
    await expect(svc(p.sujal).askRequester(t.task_id, "?")).rejects.toThrow(/only while working/);
  });

  test("Gate A cannot be answered twice", async () => {
    const p = setup();
    await pairUp(p);
    await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    await expect(svc(p.sujal).acceptDelegation(t.task_id, true)).rejects.toThrow(/not waiting/);
  });

  test("Gate C is hard: a status push with unapproved files is refused in code", async () => {
    const p = setup();
    await pairUp(p);
    await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    const s = svc(p.sujal) as unknown as { pushStatus: (t: unknown, a: unknown) => Promise<void> };
    const current = p.sujal.db.getInbound(t.task_id)!;
    const sneaky = {
      id: t.task_id,
      status: { state: "completed", timestamp: new Date().toISOString() },
      artifacts: [{ artifact_id: "a", parts: [{ kind: "file", filename: "secrets.txt", raw: Buffer.from("private").toString("base64") }] }],
    };
    await expect(s.pushStatus(current, sneaky)).rejects.toThrow(/Gate C/);
    // Even with an approval on record, different files do not match it.
    p.sujal.db.updateInbound(t.task_id, { approved_release_hash: hashResultFiles([{ filename: "presentation-1.pptx", mediaType: "x", bytes: new Uint8Array([1]) }]) }, 0);
    await expect(s.pushStatus(p.sujal.db.getInbound(t.task_id)!, sneaky)).rejects.toThrow(/Gate C/);
    expect(p.chintu.db.listOutbound()[0]!.state).toBe("working");
  });

  test("files outside the workspace cannot be released", async () => {
    const p = setup();
    await pairUp(p);
    await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    await expect(svc(p.sujal).releaseResult(t.task_id, ["../../etc/passwd"])).rejects.toThrow(/outside the workspace/);
  });

  test("Owner A cancels: Sujal stops and Owner B is told", async () => {
    const p = setup();
    await pairUp(p);
    const sent = await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    await svc(p.chintu).cancelTask(sent.id, "Not needed any more");
    expect(p.sujal.db.getInbound(t.task_id)?.state).toBe("canceled");
    expect(p.sujal.notifier.last()).toContain("canceled the task");
    await expect(svc(p.sujal).releaseResult(t.task_id, ["decks/presentation-1.pptx"])).rejects.toThrow(/nothing to release/);
    await expect(svc(p.chintu).cancelTask(sent.id)).rejects.toThrow(/already canceled/);
  });

  test("missed deadline: Owner A is asked what to do, once", async () => {
    const p = setup();
    await pairUp(p);
    await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    expect(await svc(p.chintu).deadlineSweep()).toBe(0);
    p.clock.now = Date.parse(DUE) + 60_000;
    expect(await svc(p.chintu).deadlineSweep()).toBe(1);
    expect(p.chintu.notifier.last()).toContain("deadline");
    expect(p.chintu.notifier.last()).toContain("Last state: working");
    expect(await svc(p.chintu).deadlineSweep()).toBe(0);
  });

  test("Sujal can't finish: Owner A hears it failed", async () => {
    const p = setup();
    await pairUp(p);
    const sent = await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    await svc(p.sujal).reportFailure(t.task_id, "The source data never arrived.");
    expect(p.chintu.db.getOutbound(sent.id)?.state).toBe("failed");
    expect(p.chintu.notifier.last()).toContain("could not finish");
  });

  test("a status push about someone else's task is refused", async () => {
    const p = setup();
    await pairUp(p);
    const s = svc(p.sujal) as unknown as { sendSigned: (peer: unknown, path: string, body: string) => Promise<{ status: number }> };
    const res = await s.sendSigned(p.sujal.db.getPeer("chintu"), "status", JSON.stringify({ id: "task_not_yours", status: { state: "completed", timestamp: "x" } }));
    expect(res.status).toBe(404);
  });

  test("large files go by signed link and still arrive intact", async () => {
    const p = setup();
    await pairUp(p);
    const sent = await sendDecks(p);
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 7);
    writeFileSync(join(p.workspace, "decks", "big.pptx"), big);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    await svc(p.sujal).releaseResult(t.task_id, ["decks/big.pptx"]);
    const saved = JSON.parse(p.chintu.db.getOutbound(sent.id)!.result_files_json!) as string[];
    expect(readFileSync(saved[0]!).equals(big)).toBe(true);
    expect(p.transport.log.some((l) => l.url.includes("/file?id=") && l.status === 200)).toBe(true);
  });
});

describe("files", () => {
  test("manifest hash ignores order but not names or content", () => {
    const a = { filename: "a", sha256: "1" };
    const b = { filename: "b", sha256: "2" };
    expect(manifestHash([a, b])).toBe(manifestHash([b, a]));
    expect(manifestHash([a, b])).not.toBe(manifestHash([a, { ...b, sha256: "3" }]));
  });

  test("peer file names cannot escape the folder", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("..")).toBe("file");
    expect(safeFilename("deck 1.pptx")).toBe("deck 1.pptx");
  });
});

describe("audit and delete my data", () => {
  test("outward requests are audited with ids only", async () => {
    const p = setup();
    await pairUp(p);
    const sent = await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    expect(p.chintu.db.listAudit().map((a) => a.action)).toContain("send_message");
    expect(p.sujal.db.listAudit()[0]).toMatchObject({ action: "send_status", peer_id: "chintu", detail: t.task_id });
    expect(JSON.stringify(p.chintu.db.listAudit())).not.toContain("presentations");
    expect(sent.id).toBe(t.task_id);
  });

  test("deletes everything and disconnects the other side", async () => {
    const p = setup();
    await pairUp(p);
    const sent = await sendDecks(p);
    const t = p.sujal.db.listInbound()[0]!;
    await svc(p.sujal).acceptDelegation(t.task_id, true);
    await svc(p.sujal).releaseResult(t.task_id, ["decks/presentation-1.pptx"]);
    const saved = JSON.parse(p.chintu.db.getOutbound(sent.id)!.result_files_json!) as string[];

    expect(await svc(p.chintu).deleteAllData()).toBe(1);
    expect(p.chintu.db.listPeers()).toEqual([]);
    expect(p.chintu.db.listOutbound()).toEqual([]);
    expect(p.chintu.db.listAudit()).toEqual([]);
    expect(p.chintu.secrets.values.has("peer_sujal")).toBe(false);
    expect(await Bun.file(saved[0]!).exists()).toBe(false);
    // Sujal was told and forgot Chintu too.
    expect(p.sujal.db.getPeer("chintu")).toBeNull();
  });
});
