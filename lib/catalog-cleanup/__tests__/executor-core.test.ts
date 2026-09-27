import { describe, it, expect, vi } from "vitest";
import { runPreview, runExecute, runUndo, runProbeTxn, runRefs, runConfirm, type Io } from "../executor-core";
import { VITOLA_COLUMN_LIST } from "../catalog-read";
import type { MgmtClient } from "../mgmt-client";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const V1 = "33333333-3333-4333-8333-333333333333";
const lineRow = (id: string, brand: string, series: string | null) => ({ id, brand, series, community_added: false, approved: true, created_at: null });
const vitRow = (id: string, line_id: string) => ({ id, line_id, brand: "AF", series: "H NT", name: null, format: null, ring_gauge: null, length_inches: null, wrapper: null, shade: null, wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0, community_added: false, approved: true, image_url: null, source_id: null, strength: null });

/** A fake client that answers reads from a tiny in-memory catalog and records batches. */
function fakeClient() {
  const batches: string[][] = [];
  const query = vi.fn(async (sql: string): Promise<Record<string, unknown>[]> => {
    if (/information_schema\.columns/.test(sql)) return VITOLA_COLUMN_LIST.map((c) => ({ column_name: c }));
    if (/from cigar_lines/.test(sql)) return [lineRow(A, "AF", "H"), lineRow(B, "AF", "H NT")].filter((l) => !/where id = any/.test(sql) || sql.includes(l.id));
    if (/from cigar_catalog/.test(sql)) return [vitRow(V1, B)].filter((v) => !/where (id|line_id) = any/.test(sql) || sql.includes(v.id) || sql.includes(v.line_id));
    if (/from humidor_items group by/.test(sql)) return [];
    if (/from humidor_items where/.test(sql)) return [];
    if (/_ae_txn_probe/.test(sql) && /count/.test(sql)) return [{ n: 0 }];
    return [];
  });
  const client: MgmtClient = { projectRef: "x", query, batch: vi.fn(async (s: string[]) => { batches.push(s); }) } as never;
  return { client, batches, query };
}
function fakeIo(files: Record<string, unknown>) {
  const written: Record<string, string> = {};
  const io: Io = {
    readJson: (p) => { if (!(p in files)) throw new Error(`no such file ${p}`); return files[p]; },
    writeText: (p, t) => { written[p] = t; },
    writeJson: (p, d) => { written[p] = JSON.stringify(d); files[p] = d; },
    listReceipts: () => Object.keys(files).filter((f) => f.includes("receipt-")),
    log: () => {},
  };
  return { io, written };
}
const opsFile = { version: 1, generatedAt: "x", generator: "g", ops: [{ type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {}, reason: "r", generator: "g", reviewed: false }] };

describe("runPreview", () => {
  it("writes preview.md and reports blocked count", async () => {
    const { client } = fakeClient();
    const { io, written } = fakeIo({ "ops.json": opsFile });
    const r = await runPreview(client, io, "ops.json", "out");
    expect(r.blocked).toBe(0);
    expect(written["out/preview.md"]).toContain("fold_line");
  });
  it("blocks and does not write a receipt when a precondition fails", async () => {
    const { client, batches } = fakeClient();
    const bad = { ...opsFile, ops: [{ ...opsFile.ops[0], targetLineId: V1 }] };
    const { io } = fakeIo({ "ops.json": bad });
    await expect(runExecute(client, io, "ops.json", "out")).rejects.toThrow(/blocked/);
    expect(batches).toHaveLength(0);
  });
});

describe("runExecute", () => {
  it("writes an uncommitted receipt, sends one batch, then marks the receipt committed", async () => {
    const { client, batches } = fakeClient();
    const files: Record<string, unknown> = { "ops.json": opsFile };
    const { io } = fakeIo(files);
    const r = await runExecute(client, io, "ops.json", "out");
    expect(batches).toHaveLength(1);
    expect(batches[0].join("\n")).toContain("delete from cigar_lines");
    expect((files[r.receiptPath] as { committed: boolean }).committed).toBe(true);
    expect(r.applied).toBe(1);
  });
  it("leaves the receipt uncommitted when the batch throws", async () => {
    const { client } = fakeClient();
    (client.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const files: Record<string, unknown> = { "ops.json": opsFile };
    const { io } = fakeIo(files);
    await expect(runExecute(client, io, "ops.json", "out")).rejects.toThrow(/boom/);
    const receipt = Object.entries(files).find(([k]) => k.includes("receipt-"))![1] as { committed: boolean };
    expect(receipt.committed).toBe(false);
  });
});

describe("runUndo", () => {
  it("refuses an uncommitted receipt and reverses a committed one", async () => {
    const { client, batches } = fakeClient();
    const files: Record<string, unknown> = { "ops.json": opsFile };
    const { io } = fakeIo(files);
    const r = await runExecute(client, io, "ops.json", "out");
    const receipt = files[r.receiptPath] as { committed: boolean };
    files["out/receipt-bad.json"] = { ...receipt, committed: false };
    await expect(runUndo(client, io, "out/receipt-bad.json", "out", { force: false })).rejects.toThrow(/not committed/);
    const u = await runUndo(client, io, r.receiptPath, "out", { force: false });
    expect(batches).toHaveLength(2);
    expect(batches[1].join("\n")).toContain("insert into cigar_lines");
    expect(u.reversed).toBeGreaterThan(0);
  });

  it("refuses to undo an undo receipt", async () => {
    const { client } = fakeClient();
    const files: Record<string, unknown> = { "ops.json": opsFile };
    const { io } = fakeIo(files);
    const r = await runExecute(client, io, "ops.json", "out");
    const u = await runUndo(client, io, r.receiptPath, "out", { force: false });
    await expect(runUndo(client, io, u.receiptPath, "out", { force: false })).rejects.toThrow(/undo receipt/);
  });
});

describe("runPreview uncommitted-receipt warning", () => {
  it("writes a > WARNING: line naming an uncommitted receipt in the out dir", async () => {
    const { client } = fakeClient();
    const { io, written } = fakeIo({ "ops.json": opsFile, "out/receipt-old.json": { runId: "old", committed: false, ops: [] } });
    await runPreview(client, io, "ops.json", "out");
    expect(written["out/preview.md"]).toMatch(/^> WARNING: .*out\/receipt-old\.json.*NOT committed/m);
  });
});

describe("runExecute snapshot column check", () => {
  it("passes when prod matches VITOLA_COLUMN_LIST exactly", async () => {
    const { client, batches } = fakeClient();
    await runExecute(client, fakeIo({ "ops.json": opsFile }).io, "ops.json", "out");
    expect(batches).toHaveLength(1);
  });
  it("throws before writing a receipt when prod has a column the list lacks, or lacks a listed column", async () => {
    for (const cols of [[...VITOLA_COLUMN_LIST, "created_at"], VITOLA_COLUMN_LIST.filter((c) => c !== "strength")]) {
      const { client, batches, query } = fakeClient();
      const base = query.getMockImplementation()!;
      query.mockImplementation(async (sql: string) => (/information_schema\.columns/.test(sql) ? cols.map((c) => ({ column_name: c })) : base(sql)));
      const files: Record<string, unknown> = { "ops.json": opsFile };
      await expect(runExecute(client, fakeIo(files).io, "ops.json", "out")).rejects.toThrow(/snapshot column list .*(missing prod column\(s\): created_at|prod lacks: strength)/);
      expect(batches).toHaveLength(0);
      expect(Object.keys(files).some((k) => k.includes("receipt-"))).toBe(false);
    }
  });
});

/** A client whose by-id reads answer from a fixed "current prod" state. */
function stateClient(lines: Record<string, unknown>[], vitolas: Record<string, unknown>[]) {
  const batches: string[][] = [];
  const pick = (rows: Record<string, unknown>[], sql: string) => rows.filter((r) => sql.includes(r.id as string));
  const query = vi.fn(async (sql: string): Promise<Record<string, unknown>[]> => {
    if (/from cigar_lines/.test(sql)) return pick(lines, sql);
    if (/from cigar_catalog/.test(sql)) return pick(vitolas, sql);
    return [];
  });
  const client: MgmtClient = { projectRef: "x", query, batch: vi.fn(async (s: string[]) => { batches.push(s); }) } as never;
  return { client, batches };
}
const confirmOps = [
  { type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {}, reason: "r", generator: "g", reviewed: false },
  { type: "write_name", vitolaId: V1, name: "Classic", reason: "r", generator: "g", reviewed: false },
];
const receiptOf = (over: Record<string, unknown> = {}) => ({
  runId: "run-1", executedAt: "x", opsFile: "ops.json", committed: false, ops: confirmOps,
  snapshots: { lines: [lineRow(A, "AF", "H"), lineRow(B, "AF", "H NT")], vitolas: [vitRow(V1, B)], refs: [] }, ...over,
});

describe("runConfirm", () => {
  it("marks the receipt committed when every op's postcondition holds", async () => {
    const { client } = stateClient([lineRow(A, "AF", "H")], [{ ...vitRow(V1, A), name: "Classic" }]);
    const files: Record<string, unknown> = { "out/receipt-run-1.json": receiptOf() };
    expect(await runConfirm(client, fakeIo(files).io, "out/receipt-run-1.json")).toEqual({ confirmed: true, applied: 2 });
    expect((files["out/receipt-run-1.json"] as { committed: boolean }).committed).toBe(true);
  });
  it("reports not applied when no postcondition holds, and leaves the receipt uncommitted", async () => {
    const { client } = stateClient([lineRow(A, "AF", "H"), lineRow(B, "AF", "H NT")], [vitRow(V1, B)]);
    const files: Record<string, unknown> = { "out/receipt-run-1.json": receiptOf() };
    expect(await runConfirm(client, fakeIo(files).io, "out/receipt-run-1.json")).toEqual({ confirmed: false, applied: 0 });
    expect((files["out/receipt-run-1.json"] as { committed: boolean }).committed).toBe(false);
  });
  it("throws on a partial state", async () => {
    const { client } = stateClient([lineRow(A, "AF", "H")], [vitRow(V1, A)]);
    const files: Record<string, unknown> = { "out/receipt-run-1.json": receiptOf() };
    await expect(runConfirm(client, fakeIo(files).io, "out/receipt-run-1.json")).rejects.toThrow(/partial state detected: 1 of 2 ops applied/);
    expect((files["out/receipt-run-1.json"] as { committed: boolean }).committed).toBe(false);
  });
  it("returns confirmed for an already committed receipt and refuses undo receipts", async () => {
    const { client } = stateClient([], []);
    const files: Record<string, unknown> = { "a.json": receiptOf({ committed: true }), "b.json": receiptOf({ runId: "undo-run-1" }) };
    expect(await runConfirm(client, fakeIo(files).io, "a.json")).toEqual({ confirmed: true });
    await expect(runConfirm(client, fakeIo(files).io, "b.json")).rejects.toThrow(/confirm does not support undo receipts/);
  });
});

describe("runUndo drift report", () => {
  it("warns and refuses without --force when a guarded field drifted, and proceeds with --force", async () => {
    const { client, batches } = stateClient([lineRow(A, "AF", "H")], [{ ...vitRow(V1, A), name: "Edited Later" }]);
    const logs: string[] = [];
    const files: Record<string, unknown> = { "r.json": receiptOf({ committed: true }) };
    const { io } = fakeIo(files);
    io.log = (m) => { logs.push(m); };
    await expect(runUndo(client, io, "r.json", "out", { force: false })).rejects.toThrow(/1 row\(s\) changed since the run.*--force/);
    expect(logs).toContain(`WARNING: vitola ${V1}: name drifted from "Classic" to "Edited Later"; it will not be reverted`);
    expect(batches).toHaveLength(0);
    await runUndo(client, io, "r.json", "out", { force: true });
    expect(batches).toHaveLength(1);
    expect(batches[0].join("\n")).toContain("and name is not distinct from 'Classic'");
  });
  it("does not warn when the forward values are still in place", async () => {
    const { client, batches } = stateClient([lineRow(A, "AF", "H")], [{ ...vitRow(V1, A), name: "Classic" }]);
    await runUndo(client, fakeIo({ "r.json": receiptOf({ committed: true }) }).io, "r.json", "out", { force: false });
    expect(batches).toHaveLength(1);
  });
});

describe("runProbeTxn", () => {
  it("reports rolled back when the batch fails on division by zero and the table is gone", async () => {
    const { client, query } = fakeClient();
    const batch = client.batch as ReturnType<typeof vi.fn>;
    batch.mockRejectedValueOnce(new Error("ERROR: division by zero"));
    query.mockImplementation(async (sql: string) => {
      if (/count\(\*\)/.test(sql)) throw new Error('relation "_ae_txn_probe" does not exist');
      return [];
    });
    const { io } = fakeIo({});
    expect(await runProbeTxn(client, io)).toBe("rolled back");
    expect((batch.mock.calls[0][0] as string[]).join("\n")).toMatch(/create table[\s\S]*insert[\s\S]*1\s*\/\s*0/);
    expect(query.mock.calls.filter(([s]) => /drop table if exists _ae_txn_probe/.test(s as string)).length).toBeGreaterThanOrEqual(2);
  });
  it("reports NOT rolled back when the row survives", async () => {
    const { client, query } = fakeClient();
    (client.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ERROR: division by zero"));
    query.mockImplementation(async (sql: string) => (/count\(\*\)/.test(sql) ? [{ n: "1" }] : []));
    const { io } = fakeIo({});
    expect(await runProbeTxn(client, io)).toBe("NOT rolled back");
  });
  it("reports NOT rolled back when the batch does not error at all", async () => {
    const { client, query } = fakeClient();
    query.mockImplementation(async (sql: string) => (/count\(\*\)/.test(sql) ? [{ n: 1 }] : []));
    const { io } = fakeIo({});
    expect(await runProbeTxn(client, io)).toBe("NOT rolled back");
  });
  it("throws inconclusive on a transport error from the batch or an unexpected count error, and still drops the table", async () => {
    const a = fakeClient();
    (a.client.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("fetch failed"));
    await expect(runProbeTxn(a.client, fakeIo({}).io)).rejects.toThrow(/inconclusive/);
    expect(a.query.mock.calls.filter(([s]) => /drop table if exists _ae_txn_probe/.test(s as string)).length).toBeGreaterThanOrEqual(2);
    const b = fakeClient();
    (b.client.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ERROR: division by zero"));
    b.query.mockImplementation(async (sql: string) => { if (/count\(\*\)/.test(sql)) throw new Error("503 Service Unavailable"); return []; });
    await expect(runProbeTxn(b.client, fakeIo({}).io)).rejects.toThrow(/inconclusive/);
  });
});

describe("runRefs", () => {
  it("writes refs.json and returns totals", async () => {
    const { client } = fakeClient();
    const { io, written } = fakeIo({});
    const r = await runRefs(client, io, "out");
    expect(r).toEqual({ vitolasWithRefs: 0, totalRefs: 0 });
    expect(written["out/refs.json"]).toBe("{}");
  });
});
