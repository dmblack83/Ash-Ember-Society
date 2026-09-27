import { describe, it, expect, vi } from "vitest";
import { VITOLA_COLUMN_LIST, VITOLA_COLUMNS, normalizeVitola, normalizeLine, fetchRefCounts, fetchVitolasById, fetchRefRows, buildContext } from "../catalog-read";
import type { MgmtClient } from "../mgmt-client";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const fake = (rows: unknown[]): MgmtClient & { query: ReturnType<typeof vi.fn> } => {
  const query = vi.fn(async () => rows);
  return { projectRef: "x", query, batch: vi.fn() } as never;
};

describe("normalizeVitola", () => {
  it("coerces numeric strings, nulls, and array shapes", () => {
    const v = normalizeVitola({ id: A, line_id: B, brand: "B", series: null, name: null, format: "Toro",
      ring_gauge: "50", length_inches: "5.25", wrapper: null, shade: null, wrapper_country: null, binder_country: null,
      filler_countries: "{Nicaragua,\"Dom. Rep\"}", usage_count: "3", community_added: "f", approved: true, image_url: null, source_id: "seed-1" });
    expect(v.ring_gauge).toBe(50);
    expect(v.length_inches).toBe(5.25);
    expect(v.usage_count).toBe(3);
    expect(v.community_added).toBe(false);
    expect(v.filler_countries).toEqual(["Nicaragua", "Dom. Rep"]);
    expect(v.strength).toBeNull();
    expect(normalizeVitola({ id: A, strength: "medium_full" }).strength).toBe("medium_full");
    expect(normalizeLine({ id: A, brand: "P", created_at: "2026-09-06 10:00:00+00" }).created_at).toBe("2026-09-06 10:00:00+00");
  });
  it("keeps JSON arrays and maps missing usage_count to 0", () => {
    const v = normalizeVitola({ id: A, filler_countries: ["a"], usage_count: null });
    expect(v.filler_countries).toEqual(["a"]);
    expect(v.usage_count).toBe(0);
    expect(v.line_id).toBeNull();
  });
  it("throws on a missing or invalid id", () => {
    expect(() => normalizeVitola({ id: "nope" })).toThrow(/id/);
  });
});

describe("normalizeLine", () => {
  it("coerces booleans and requires brand", () => {
    expect(normalizeLine({ id: A, brand: "Padron", series: null, community_added: "t", approved: "f" }))
      .toEqual({ id: A, brand: "Padron", series: null, community_added: true, approved: false, created_at: null });
    expect(() => normalizeLine({ id: A, brand: null })).toThrow(/brand/);
  });
});

describe("fetchRefCounts", () => {
  it("sums humidor and smoke-log counts per vitola", async () => {
    const client = fake([{ cigar_id: A, n: "2" }, { cigar_id: A, n: 1 }, { cigar_id: B, n: "1" }]);
    expect(await fetchRefCounts(client)).toEqual({ [A]: 3, [B]: 1 });
    expect(client.query.mock.calls[0][0]).toMatch(/from humidor_items[\s\S]*union all[\s\S]*from smoke_logs/);
  });
});

describe("fetchVitolasById", () => {
  it("returns [] without a query for no ids, and uses an any(array) filter otherwise", async () => {
    const client = fake([]);
    expect(await fetchVitolasById(client, [])).toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
    await fetchVitolasById(client, [A, B]);
    expect(client.query.mock.calls[0][0]).toContain(`id = any(array['${A}'::uuid,'${B}'::uuid])`);
  });
  it("rejects a non-uuid id before querying", async () => {
    const client = fake([]);
    await expect(fetchVitolasById(client, ["x"])).rejects.toThrow(/uuid/);
  });
});

describe("fetchRefRows", () => {
  it("queries all four referencing tables and tags rows with the table", async () => {
    const client = fake([{ t: "humidor_items", id: B, cigar_id: A }, { t: "smoke_logs", id: A, cigar_id: A }]);
    const rows = await fetchRefRows(client, [A]);
    expect(rows).toEqual([{ table: "humidor_items", id: B, cigar_id: A }, { table: "smoke_logs", id: A, cigar_id: A }]);
    const sql = client.query.mock.calls[0][0] as string;
    for (const t of ["humidor_items", "smoke_logs", "cigar_edit_suggestions", "cigar_image_submissions"]) expect(sql).toContain(`from ${t}`);
  });
});

describe("buildContext", () => {
  it("indexes lines and vitolas by id", () => {
    const ctx = buildContext([normalizeLine({ id: A, brand: "P" })], [normalizeVitola({ id: B, line_id: A })], { [B]: 1 });
    expect(ctx.lines.get(A)?.brand).toBe("P");
    expect(ctx.vitolas.get(B)?.line_id).toBe(A);
    expect(ctx.refs[B]).toBe(1);
  });
});

describe("VITOLA_COLUMN_LIST", () => {
  it("is the single source for the select string and includes strength", () => {
    expect(VITOLA_COLUMNS).toBe(VITOLA_COLUMN_LIST.join(", "));
    expect(VITOLA_COLUMN_LIST).toContain("strength");
  });
});
