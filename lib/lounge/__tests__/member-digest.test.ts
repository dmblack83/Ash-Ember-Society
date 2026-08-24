import { describe, it, expect } from "vitest";
import {
  digestWindowStart,
  digestContent,
  DIGEST_TITLE,
  LAUNCH_WINDOW_DAYS,
} from "@/lib/lounge/member-digest";

const NOW = new Date("2026-08-28T19:00:00.000Z"); // a Friday 12:00 MST

describe("digestWindowStart", () => {
  it("uses the previous digest's timestamp when one exists", () => {
    const prev = "2026-08-21T19:00:11.000Z";
    expect(digestWindowStart(prev, NOW).toISOString()).toBe(prev);
  });

  it("falls back to 14 days before now when no digest exists (launch post)", () => {
    const start = digestWindowStart(null, NOW);
    const days = (NOW.getTime() - start.getTime()) / 86_400_000;
    expect(days).toBe(LAUNCH_WINDOW_DAYS);
    expect(LAUNCH_WINDOW_DAYS).toBe(14);
  });
});

describe("digestContent", () => {
  it("pluralizes correctly", () => {
    expect(digestContent(1)).toBe("1 new member joined the Society.");
    expect(digestContent(8)).toBe("8 new members joined the Society.");
    expect(digestContent(50)).toBe("50 new members joined the Society.");
  });
});

describe("DIGEST_TITLE", () => {
  it("is the eyebrow copy with no em dashes", () => {
    expect(DIGEST_TITLE).toBe("This Week's New Members");
    expect(DIGEST_TITLE.includes("—")).toBe(false);
  });
});
