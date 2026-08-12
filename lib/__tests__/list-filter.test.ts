import { expect, test } from "vitest";
import { matchesQuery } from "@/lib/humidor/list-filter";

const item = { cigar: { brand: "Padrón", series: "1964 Anniversary", wrapper: "Maduro" } };
test("empty query matches", () => expect(matchesQuery(item, "")).toBe(true));
test("brand, case-insensitive", () => expect(matchesQuery(item, "padr")).toBe(true));
test("series", () => expect(matchesQuery(item, "1964")).toBe(true));
test("wrapper", () => expect(matchesQuery(item, "maduro")).toBe(true));
test("no match", () => expect(matchesQuery(item, "opus")).toBe(false));
test("null fields", () =>
  expect(matchesQuery({ cigar: { brand: null, series: null, wrapper: null } }, "x")).toBe(false));
