import { describe, expect, test } from "vitest";
import { stageForEntry } from "../add-flow-entry";

describe("stageForEntry", () => {
  test("search entry opens at the search stage", () => {
    expect(stageForEntry({ kind: "search" })).toBe("search");
  });

  test("line entry opens at the picker stage", () => {
    expect(stageForEntry({ kind: "line", brand: "Padrón", series: "1964 Anniversary" })).toBe("picker");
  });

  test("vitola entry opens at the save stage", () => {
    expect(stageForEntry({ kind: "vitola", cigarId: "abc-123" })).toBe("save");
  });

  test("manual entry opens at the manual stage", () => {
    expect(stageForEntry({ kind: "manual" })).toBe("manual");
  });

  test("manual entry with a scanner-prefilled brand still opens at the manual stage", () => {
    expect(stageForEntry({ kind: "manual", brand: "Arturo Fuente" })).toBe("manual");
  });
});
