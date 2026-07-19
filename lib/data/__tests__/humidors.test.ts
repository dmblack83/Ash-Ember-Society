import { describe, expect, test } from "vitest";
import { mapHumidorInsertError, HumidorLimitReachedError } from "../humidors";

describe("mapHumidorInsertError", () => {
  test("free-limit P0001 maps to HumidorLimitReachedError", () => {
    const err = { code: "P0001", message: "humidors_free_tier_limit" };
    expect(mapHumidorInsertError(err)).toBeInstanceOf(HumidorLimitReachedError);
  });
  test("other errors pass through as generic Error with message", () => {
    const err = { code: "23505", message: "duplicate key" };
    const mapped = mapHumidorInsertError(err);
    expect(mapped).toBeInstanceOf(Error);
    expect(mapped).not.toBeInstanceOf(HumidorLimitReachedError);
  });
});
