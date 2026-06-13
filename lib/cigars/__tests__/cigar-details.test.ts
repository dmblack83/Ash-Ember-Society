import { describe, it, expect } from "vitest";
import {
  EMPTY_CIGAR_DETAILS,
  toggleFiller,
  cigarDetailsToCatalogFields,
  cigarDetailsToRpcArgs,
  cigarDetailsToSuggestionRow,
  diffCigarFields,
  cigarDetailsFromCurrent,
  type CigarDetails,
} from "@/lib/cigars/cigar-details";

const filled: CigarDetails = {
  brand:           "  Padron  ",
  series:          "1964",
  format:          "Robusto",
  ringGauge:       "50",
  lengthInches:    "5",
  shade:           "Maduro",
  wrapper:         "Habano",
  wrapperCountry:  "Nicaragua",
  binderCountry:   "Nicaragua",
  fillerCountries: ["Nicaragua", "Honduras"],
};

describe("EMPTY_CIGAR_DETAILS", () => {
  it("has empty strings and an empty filler array", () => {
    expect(EMPTY_CIGAR_DETAILS.brand).toBe("");
    expect(EMPTY_CIGAR_DETAILS.fillerCountries).toEqual([]);
  });
});

describe("toggleFiller", () => {
  it("appends a country not yet present, preserving order", () => {
    expect(toggleFiller(["Nicaragua"], "Honduras")).toEqual(["Nicaragua", "Honduras"]);
  });
  it("removes a country already present, preserving remaining order", () => {
    expect(toggleFiller(["Nicaragua", "Honduras", "Mexico"], "Honduras"))
      .toEqual(["Nicaragua", "Mexico"]);
  });
  it("does not mutate the input array", () => {
    const input = ["Nicaragua"];
    toggleFiller(input, "Honduras");
    expect(input).toEqual(["Nicaragua"]);
  });
});

describe("cigarDetailsToCatalogFields", () => {
  it("trims strings, parses numbers, snake-cases keys", () => {
    expect(cigarDetailsToCatalogFields(filled)).toEqual({
      brand:            "Padron",
      series:           "1964",
      format:           "Robusto",
      ring_gauge:       50,
      length_inches:    5,
      shade:            "Maduro",
      wrapper:          "Habano",
      wrapper_country:  "Nicaragua",
      binder_country:   "Nicaragua",
      filler_countries: ["Nicaragua", "Honduras"],
    });
  });
  it("maps empty strings to null and empty filler array to null", () => {
    expect(cigarDetailsToCatalogFields(EMPTY_CIGAR_DETAILS)).toEqual({
      brand:            null,
      series:           null,
      format:           null,
      ring_gauge:       null,
      length_inches:    null,
      shade:            null,
      wrapper:          null,
      wrapper_country:  null,
      binder_country:   null,
      filler_countries: null,
    });
  });
});

describe("cigarDetailsToRpcArgs", () => {
  it("produces p_-prefixed params with binder + filler", () => {
    expect(cigarDetailsToRpcArgs(filled)).toEqual({
      p_brand:            "Padron",
      p_series:           "1964",
      p_format:           "Robusto",
      p_ring_gauge:       50,
      p_length_inches:    5,
      p_wrapper:          "Habano",
      p_wrapper_country:  "Nicaragua",
      p_shade:            "Maduro",
      p_binder_country:   "Nicaragua",
      p_filler_countries: ["Nicaragua", "Honduras"],
    });
  });
});

describe("cigarDetailsToSuggestionRow", () => {
  it("adds suggested_by and a composed name on top of catalog fields", () => {
    const row = cigarDetailsToSuggestionRow(filled, "user-1");
    expect(row.suggested_by).toBe("user-1");
    expect(row.name).toBe("Padron - 1964 - Robusto");
    expect(row.binder_country).toBe("Nicaragua");
    expect(row.filler_countries).toEqual(["Nicaragua", "Honduras"]);
  });
});

describe("diffCigarFields", () => {
  it("returns only changed scalar fields", () => {
    const a = cigarDetailsToCatalogFields(filled);
    const b = cigarDetailsToCatalogFields({ ...filled, shade: "Oscuro / Double Maduro" });
    expect(diffCigarFields(a, b)).toEqual({ shade: "Oscuro / Double Maduro" });
  });
  it("treats array reorder as a change", () => {
    const a = cigarDetailsToCatalogFields(filled);
    const b = cigarDetailsToCatalogFields({ ...filled, fillerCountries: ["Honduras", "Nicaragua"] });
    expect(diffCigarFields(a, b)).toEqual({ filler_countries: ["Honduras", "Nicaragua"] });
  });
  it("returns empty object when nothing changed", () => {
    const a = cigarDetailsToCatalogFields(filled);
    expect(diffCigarFields(a, a)).toEqual({});
  });
});

describe("cigarDetailsFromCurrent", () => {
  it("maps a catalog row (snake_case, nullable) into form state", () => {
    expect(cigarDetailsFromCurrent({
      brand:            "Padron",
      series:           null,
      format:           "Robusto",
      ring_gauge:       50,
      length_inches:    5,
      shade:            null,
      wrapper:          "Habano",
      wrapper_country:  "Nicaragua",
      binder_country:   null,
      filler_countries: ["Nicaragua"],
    })).toEqual({
      brand:           "Padron",
      series:          "",
      format:          "Robusto",
      ringGauge:       "50",
      lengthInches:    "5",
      shade:           "",
      wrapper:         "Habano",
      wrapperCountry:  "Nicaragua",
      binderCountry:   "",
      fillerCountries: ["Nicaragua"],
    });
  });
});
