import { describe, expect, it } from "vitest";

import { escapeIlikeExact } from "@/lib/ilike-escape";

describe("escapeIlikeExact", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeIlikeExact("Chateau Fuente")).toBe("Chateau Fuente");
  });

  it("escapes percent wildcards", () => {
    expect(escapeIlikeExact("100% Fuente")).toBe("100\\% Fuente");
  });

  it("escapes underscore wildcards", () => {
    expect(escapeIlikeExact("Opus_X")).toBe("Opus\\_X");
  });

  it("escapes literal backslashes before escaping other wildcards", () => {
    expect(escapeIlikeExact("a\\b")).toBe("a\\\\b");
  });

  it("escapes a mix of backslash, percent, and underscore in order", () => {
    expect(escapeIlikeExact("a\\_b%c")).toBe("a\\\\\\_b\\%c");
  });

  it("leaves empty strings unchanged", () => {
    expect(escapeIlikeExact("")).toBe("");
  });
});
