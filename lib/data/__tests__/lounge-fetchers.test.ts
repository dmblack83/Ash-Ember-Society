import { describe, it, expect } from "vitest";
import { orderByIds, buildThirdsIndex } from "../lounge-fetchers";

describe("orderByIds", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("reorders rows to match the id list (hot RPC ranking)", () => {
    expect(orderByIds(rows, ["c", "a", "b"]).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("drops ids with no matching row", () => {
    expect(orderByIds(rows, ["b", "missing", "a"]).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("returns empty for empty ids", () => {
    expect(orderByIds(rows, [])).toEqual([]);
  });
});

describe("buildThirdsIndex", () => {
  const base = { flavor_tag_ids: null, user_id: null };

  it("indexes only thirds-enabled burn reports", () => {
    const { burnReportIds, reportIdToSmokeLogId } = buildThirdsIndex([
      { ...base, id: "log-1", burn_report: [{ id: "br-1", thirds_enabled: true }] },
      { ...base, id: "log-2", burn_report: [{ id: "br-2", thirds_enabled: false }] },
      { ...base, id: "log-3", burn_report: null },
    ]);
    expect(burnReportIds).toEqual(["br-1"]);
    expect(reportIdToSmokeLogId).toEqual({ "br-1": "log-1" });
  });

  it("handles burn_report arriving as an object instead of an array", () => {
    const { burnReportIds, reportIdToSmokeLogId } = buildThirdsIndex([
      {
        ...base,
        id: "log-9",
        burn_report: { id: "br-9", thirds_enabled: true } as unknown as Array<Record<string, unknown>>,
      },
    ]);
    expect(burnReportIds).toEqual(["br-9"]);
    expect(reportIdToSmokeLogId["br-9"]).toBe("log-9");
  });

  it("skips reports with no id", () => {
    const { burnReportIds } = buildThirdsIndex([
      { ...base, id: "log-1", burn_report: [{ thirds_enabled: true }] },
    ]);
    expect(burnReportIds).toEqual([]);
  });
});
