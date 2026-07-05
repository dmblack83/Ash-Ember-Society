import { describe, it, expect } from "vitest";
import { selectQueryWords, scoreCandidates } from "../ocr-match";

const row = (brand: string, series: string | null, format: string | null) => ({
  brand,
  series,
  format,
});

describe("selectQueryWords", () => {
  it("drops stop words and short words", () => {
    const words = selectQueryWords("The COHIBA de Cuba 21");
    expect(words).toEqual(["cohiba"]);
  });

  it("dedupes repeated words", () => {
    const words = selectQueryWords("COHIBA cohiba Cohiba Esplendidos");
    expect(words).toEqual(["esplendidos", "cohiba"]);
  });

  it("prefers longer (more distinctive) words when over the cap", () => {
    const words = selectQueryWords(
      "one two ten red big sun MONTECRISTO abc def ghi jkl mno pqr stu",
      3
    );
    expect(words[0]).toBe("montecristo");
    expect(words).toHaveLength(3);
  });

  it("folds accents so OCR output matches unaccented catalog text", () => {
    const words = selectQueryWords("Padrón Añejo");
    expect(words).toContain("padron");
    expect(words).toContain("anejo");
  });

  it("keeps numeric series names like 1964", () => {
    expect(selectQueryWords("Padron 1964 Anniversary")).toContain("1964");
  });

  it("returns empty for empty or all-noise text", () => {
    expect(selectQueryWords("")).toEqual([]);
    expect(selectQueryWords("the and for est")).toEqual([]);
  });
});

describe("scoreCandidates", () => {
  it("ranks a brand match above a series-only match", () => {
    const rows = [
      row("Romeo y Julieta", "Reserva Real", "Toro"),
      row("Oliva", "Serie V Melanio Reserva", "Toro"),
    ];
    const out = scoreCandidates(
      ["romeo", "julieta", "reserva"],
      "romeo y julieta reserva",
      rows
    );
    expect(out[0].brand).toBe("Romeo y Julieta");
  });

  it("gives a full-brand phrase bonus from raw OCR text", () => {
    const rows = [
      row("Julieta", null, "Robusto"), // partial-word overlap only
      row("Romeo y Julieta", "1875", "Churchill"),
    ];
    const out = scoreCandidates(
      ["romeo", "julieta"],
      "ROMEO Y JULIETA habana",
      rows
    );
    expect(out[0].brand).toBe("Romeo y Julieta");
  });

  it("matches accented catalog brands against folded OCR words", () => {
    const rows = [row("Padrón", "1964 Anniversary", "Torpedo")];
    const out = scoreCandidates(["padron", "1964"], "padron 1964", rows);
    expect(out).toHaveLength(1);
  });

  it("drops candidates below the score threshold", () => {
    const rows = [row("Arturo Fuente", "Hemingway", "Short Story")];
    // "toro" appears nowhere in this row
    const out = scoreCandidates(["toro"], "toro", rows);
    expect(out).toEqual([]);
  });

  it("caps results at five", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row("Cohiba", `Linea ${i}`, "Robusto")
    );
    const out = scoreCandidates(["cohiba"], "cohiba", rows);
    expect(out).toHaveLength(5);
  });

  it("strips internal score fields from results", () => {
    const out = scoreCandidates(["cohiba"], "cohiba", [
      row("Cohiba", null, null),
    ]);
    expect(Object.keys(out[0])).not.toContain("_score");
  });
});
