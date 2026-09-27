import { describe, it, expect } from "vitest";
import { checkPreconditions, renderPreview, normIdent } from "../preview";
import type { CatalogContext, LineRow, Op, VitolaRow } from "../types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "55555555-5555-4555-8555-555555555555";
const V1 = "33333333-3333-4333-8333-333333333333";
const V2 = "44444444-4444-4444-8444-444444444444";
const V3 = "66666666-6666-4666-8666-666666666666";
const base = { reason: "r", generator: "t", reviewed: false };
const line = (id: string, brand: string, series: string | null, community = false): LineRow => ({ id, brand, series, community_added: community, approved: true });
const vit = (id: string, line_id: string, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id, line_id, brand: "B", series: "S", name: null, format: null, ring_gauge: null, length_inches: null, wrapper: null,
  shade: null, wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0,
  community_added: false, approved: true, image_url: null, source_id: null, ...extra,
});
const ctx = (over: Partial<CatalogContext> = {}): CatalogContext => ({
  lines: new Map([[A, line(A, "Arturo Fuente", "Hemingway")], [B, line(B, "Arturo Fuente", "Hemingway NT")], [C, line(C, "Padron", null, true)]]),
  vitolas: new Map([[V1, vit(V1, B)], [V2, vit(V2, A)], [V3, vit(V3, C)]]),
  refs: {},
  ...over,
});
const fold = (o: Partial<Op> = {}): Op => ({ ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {}, ...o } as Op);

describe("normIdent", () => {
  it("lowercases, trims, and treats null series as empty", () => {
    expect(normIdent("  Chateau Fuente ", null)).toBe("chateau fuente|");
    expect(normIdent("Padron", " 1964 ")).toBe("padron|1964");
  });
});

describe("checkPreconditions", () => {
  it("passes a clean fold", () => {
    expect(checkPreconditions([fold()], ctx())).toEqual([]);
  });
  it("blocks unknown ids", () => {
    expect(checkPreconditions([fold({ targetLineId: V1 } as never)], ctx())[0].reason).toMatch(/target line .* not found/);
    expect(checkPreconditions([{ ...base, type: "write_name", vitolaId: A, name: "x" }], ctx())[0].reason).toMatch(/vitola .* not found/);
  });
  it("blocks an unreviewed fold of a community-added line or of children with real refs", () => {
    expect(checkPreconditions([fold({ sourceLineId: C, targetLineId: A } as never)], ctx())[0].reason).toMatch(/community-added/);
    expect(checkPreconditions([fold()], ctx({ refs: { [V1]: 2 } }))[0].reason).toMatch(/real reference/);
    expect(checkPreconditions([fold({ reviewed: true } as never)], ctx({ refs: { [V1]: 2 } }))).toEqual([]);
  });
  it("blocks a childFill that would overwrite a non-null field or targets a child outside the source line", () => {
    const c = ctx(); c.vitolas.set(V1, vit(V1, B, { shade: "Maduro" }));
    expect(checkPreconditions([fold({ childFills: { [V1]: { shade: "Natural" } } } as never)], c)[0].reason).toMatch(/already has shade/);
    expect(checkPreconditions([fold({ childFills: { [V2]: { shade: "Natural" } } } as never)], ctx())[0].reason).toMatch(/not a child of the source line/);
  });
  it("blocks a rename that collides on normalized identity", () => {
    const op: Op = { ...base, type: "rename_line", lineId: B, brand: "arturo fuente", series: " Hemingway " };
    expect(checkPreconditions([op], ctx())[0].reason).toMatch(/collides with line/);
  });
  it("blocks update_vitola range violations and write_name on a named row", () => {
    expect(checkPreconditions([{ ...base, type: "update_vitola", vitolaId: V1, fields: { ring_gauge: 200 } }], ctx())[0].reason).toMatch(/ring_gauge/);
    const c = ctx(); c.vitolas.set(V1, vit(V1, B, { name: "Classic" }));
    expect(checkPreconditions([{ ...base, type: "write_name", vitolaId: V1, name: "x" }], c)[0].reason).toMatch(/already has a name/);
  });
  it("blocks a merge across lines and an unreviewed merge of a referenced source", () => {
    expect(checkPreconditions([{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }], ctx())[0].reason).toMatch(/different lines/);
    const c = ctx(); c.vitolas.set(V2, vit(V2, B));
    expect(checkPreconditions([{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }], c)).toEqual([]);
    expect(checkPreconditions([{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }], { ...c, refs: { [V1]: 1 } })[0].reason).toMatch(/real reference/);
  });
  it("blocks any other op on a vitola that is merged away in the same run", () => {
    const c = ctx(); c.vitolas.set(V2, vit(V2, B));
    const ops: Op[] = [
      { ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 },
      { ...base, type: "write_name", vitolaId: V1, name: "x" },
    ];
    const blocked = checkPreconditions(ops, c);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ opIndex: 1 });
    expect(blocked[0].reason).toMatch(/merged away/);
  });
  it("blocks a line folded twice or renamed after being folded", () => {
    const twice = checkPreconditions([fold(), fold()], ctx());
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ opIndex: 1 });
    expect(twice[0].reason).toMatch(/already folded/);
    const renamed = checkPreconditions([fold(), { ...base, type: "rename_line", lineId: B, brand: "X", series: null }], ctx());
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatchObject({ opIndex: 1 });
    expect(renamed[0].reason).toMatch(/folded away/);
  });
  it("accepts childFills for a child that an earlier fold moved into the source line", () => {
    const c = ctx();
    const ops: Op[] = [
      fold({ sourceLineId: C, targetLineId: B } as never),
      fold({ sourceLineId: B, targetLineId: A, childFills: { [V3]: { shade: "Maduro" }, [V1]: { shade: "Maduro" } } } as never),
    ];
    c.lines.set(C, line(C, "Arturo Fuente", "Hemingway NT  ", false));
    expect(checkPreconditions(ops, c)).toEqual([]);
  });
  it("gates a later fold on children that an earlier fold moved in", () => {
    const c = ctx();
    c.lines.set(C, line(C, "Arturo Fuente", "Hemingway NT  ", false));
    const ops: Op[] = [
      fold({ sourceLineId: C, targetLineId: B, reviewed: true } as never),
      fold({ sourceLineId: B, targetLineId: A } as never),
    ];
    const blocked = checkPreconditions(ops, { ...c, refs: { [V3]: 1 } });
    expect(blocked).toEqual([expect.objectContaining({ opIndex: 1, reason: expect.stringMatching(/real reference/) })]);
  });
});

describe("renderPreview", () => {
  it("renders counts by type, a sample table with before/after, and the blocked list", () => {
    const md = renderPreview({
      ops: [fold({ childFills: { [V1]: { shade: "Natural" } } } as never), { ...base, type: "write_name", vitolaId: V2, name: "Classic" }],
      ctx: ctx(), blocked: [{ opIndex: 1, reason: "vitola already has a name" }], generator: "rules-tier-a",
    });
    expect(md).toContain("# Catalog cleanup preview");
    expect(md).toContain("| fold_line | 1 |");
    expect(md).toContain("| write_name | 1 |");
    expect(md).toContain("Hemingway NT");
    expect(md).toContain("→");
    expect(md).toContain("shade: (null) → Natural");
    expect(md).toContain("## Blocked (1)");
    expect(md).toContain("vitola already has a name");
  });
  it("marks QA-sample rows and says nothing to do for an empty file", () => {
    expect(renderPreview({ ops: [], ctx: ctx(), blocked: [], generator: "g" })).toContain("Nothing to do");
    const md = renderPreview({ ops: [fold()], ctx: ctx(), blocked: [], generator: "g", qaSample: [0] });
    expect(md).toContain("QA sample");
  });
});
