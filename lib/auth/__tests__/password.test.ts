import { describe, test, expect } from "vitest";
import { validateNewPassword, MIN_PASSWORD_LENGTH } from "../password";

describe("validateNewPassword", () => {
  test("returns null for a valid matching password", () => {
    expect(validateNewPassword("hunter2hunter", "hunter2hunter")).toBeNull();
  });

  test("rejects passwords shorter than the minimum", () => {
    expect(validateNewPassword("short", "short")).toMatch(/at least/i);
  });

  test("accepts a password exactly at the minimum length", () => {
    const pw = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(validateNewPassword(pw, pw)).toBeNull();
  });

  test("rejects when confirmation does not match", () => {
    expect(validateNewPassword("hunter2hunter", "hunter2HUNTER")).toMatch(/match/i);
  });

  test("reports the length problem before the mismatch problem", () => {
    // A too-short password that also mismatches should surface length first,
    // so the user fixes the more fundamental issue first.
    expect(validateNewPassword("abc", "xyz")).toMatch(/at least/i);
  });

  test("rejects an empty password", () => {
    expect(validateNewPassword("", "")).toMatch(/at least/i);
  });
});
