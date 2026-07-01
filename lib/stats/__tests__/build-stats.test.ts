import { describe, expect, it, vi, afterEach } from "vitest";

import {
  buildStatsData,
  buildRatingBuckets,
  buildMonthlyBars,
  type StatsSmokeLog,
  type StatsHumidorRow,
} from "@/lib/stats/build-stats";

afterEach(() => {
  vi.useRealTimers();
});

function log(overrides: Partial<StatsSmokeLog> = {}): StatsSmokeLog {
  return {
    id:             "l1",
    smoked_at:      "2026-06-15T20:00:00Z",
    overall_rating: 80,
    flavor_tag_ids: null,
    cigar_id:       "c1",
    ...overrides,
  };
}

function row(overrides: Partial<StatsHumidorRow> = {}): StatsHumidorRow {
  return {
    quantity:          2,
    purchase_quantity: 5,
    price_paid_cents:  1000,
    cigar:             { id: "c1", brand: "Padron", strength: "full" },
    ...overrides,
  };
}

describe("buildStatsData", () => {
  it("computes totals, investment, and collection value", () => {
    const data = buildStatsData([log(), log({ id: "l2", overall_rating: 90 })], [row()], []);

    expect(data.totalCigars).toBe(2);
    expect(data.totalReports).toBe(2);
    expect(data.avgRating).toBe("85.0");
    /* lifetime: purchase_quantity(5) * 1000 */
    expect(data.lifetimeInvestmentCents).toBe(5000);
    /* collection: quantity(2) * 1000 */
    expect(data.collectionValueCents).toBe(2000);
    expect(data.hasEnough).toBe(false);
  });

  it("falls back to quantity when purchase_quantity is null", () => {
    const data = buildStatsData([], [row({ purchase_quantity: null })], []);
    expect(data.lifetimeInvestmentCents).toBe(2000);
  });

  it("handles the empty state", () => {
    const data = buildStatsData([], [], []);
    expect(data.avgRating).toBeNull();
    expect(data.totalCigars).toBe(0);
    expect(data.strengthDist).toEqual([]);
    expect(data.topBrands).toEqual([]);
  });
});

describe("buildRatingBuckets", () => {
  it("buckets ratings inclusively", () => {
    const buckets = buildRatingBuckets([
      log({ overall_rating: 20 }),
      log({ overall_rating: 21 }),
      log({ overall_rating: 100 }),
    ]);
    expect(buckets.find((b) => b.label === "1-20")?.count).toBe(1);
    expect(buckets.find((b) => b.label === "21-40")?.count).toBe(1);
    expect(buckets.find((b) => b.label === "81-100")?.count).toBe(1);
  });
});

describe("buildMonthlyBars", () => {
  it("returns 12 buckets with the current month flagged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));

    /* Mid-day timestamp so the local-time bucketing lands in July
       regardless of the machine's timezone offset. */
    const bars = buildMonthlyBars([log({ smoked_at: "2026-07-01T18:00:00Z" })]);
    expect(bars).toHaveLength(12);
    expect(bars[11].isCurrent).toBe(true);
    expect(bars[11].count).toBe(1);
    expect(bars.slice(0, 11).every((b) => b.count === 0)).toBe(true);
  });
});
