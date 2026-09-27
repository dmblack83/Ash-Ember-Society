import { describe, it, expect } from "vitest";
import { DEFAULT_OUT_DIR, parseOut } from "../cli-args";

describe("parseOut", () => {
  it("defaults the out dir and leaves the other args alone", () => {
    expect(parseOut(["preview", "ops.json"])).toEqual({ outDir: DEFAULT_OUT_DIR, rest: ["preview", "ops.json"] });
  });
  it("removes --out and its value", () => {
    expect(parseOut(["undo", "--out", "d", "r.json", "--force"])).toEqual({ outDir: "d", rest: ["undo", "r.json", "--force"] });
  });
  it("throws when --out has no directory after it", () => {
    expect(() => parseOut(["preview", "ops.json", "--out"])).toThrow("--out needs a directory");
    expect(() => parseOut(["--out", "--force"])).toThrow("--out needs a directory");
  });
});
