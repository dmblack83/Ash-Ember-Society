import { describe, expect, test } from "vitest";
import {
  FREE_TIER_LIMITS,
  isAtHumidorLimit,
  getMembershipTier,
  canAccess,
} from "../membership";

/* ------------------------------------------------------------------
   Free-tier limits — product decision 2026-07-03: free members get
   20 unique cigars (unlimited quantity each), full lounge access,
   unlimited burn reports.
   ------------------------------------------------------------------ */

const FREE  = { membership_tier: "free" as const };
const PAID  = { membership_tier: "member" as const };

describe("FREE_TIER_LIMITS", () => {
  test("free tier allows 20 unique cigars", () => {
    expect(FREE_TIER_LIMITS.humidor_items).toBe(20);
  });
});

describe("isAtHumidorLimit", () => {
  test("free member below the cap is not at the limit", () => {
    expect(isAtHumidorLimit(FREE, 19)).toBe(false);
  });

  test("free member at the cap is at the limit", () => {
    expect(isAtHumidorLimit(FREE, 20)).toBe(true);
  });

  test("paid member is never at the limit", () => {
    expect(isAtHumidorLimit(PAID, 500)).toBe(false);
  });

  test("legacy premium tier is treated as paid", () => {
    expect(isAtHumidorLimit({ membership_tier: "premium" }, 500)).toBe(false);
  });
});

describe("lounge access", () => {
  test("free members can post in the lounge", () => {
    expect(canAccess(FREE, "community_posting")).toBe(true);
  });

  test("free members can file burn reports", () => {
    expect(canAccess(FREE, "burn_report")).toBe(true);
  });
});

describe("getMembershipTier", () => {
  test("null profile defaults to free", () => {
    expect(getMembershipTier(null)).toBe("free");
  });

  test("founder badge grants member tier", () => {
    expect(getMembershipTier({ membership_tier: "free", assigned_badges: ["founder"] })).toBe("member");
  });
});
