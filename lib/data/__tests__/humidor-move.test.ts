import { describe, it, expect, vi, beforeEach } from "vitest";

/* Chainable Supabase mock: supabase.from("humidor_items").update({...}).in("id", ids) */
const { fromMock, updateMock, inMock } = vi.hoisted(() => ({
  fromMock:   vi.fn(),
  updateMock: vi.fn(),
  inMock:     vi.fn(),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ from: fromMock }),
}));

import { moveItemsToHumidor, friendlyWriteError } from "../humidor-move";
import { isLikelyOfflineError } from "@/lib/offline-outbox";

beforeEach(() => {
  vi.clearAllMocks();
  fromMock.mockReturnValue({ update: updateMock });
  updateMock.mockReturnValue({ in: inMock });
  inMock.mockResolvedValue({ error: null });
});

describe("moveItemsToHumidor", () => {
  it("no-ops on empty itemIds without touching Supabase", async () => {
    await moveItemsToHumidor([], "humidor-1");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("issues a single update().in() call scoped to the given ids", async () => {
    await moveItemsToHumidor(["item-1", "item-2"], "humidor-9");

    expect(fromMock).toHaveBeenCalledWith("humidor_items");
    expect(updateMock).toHaveBeenCalledWith({ humidor_id: "humidor-9" });
    expect(inMock).toHaveBeenCalledWith("id", ["item-1", "item-2"]);
  });

  it("throws Error(message) when the update fails", async () => {
    inMock.mockResolvedValue({ error: { message: "row-level security violation" } });

    await expect(moveItemsToHumidor(["item-1"], "humidor-9")).rejects.toThrow(
      "row-level security violation",
    );
  });
});

describe("friendlyWriteError", () => {
  it("maps a fetch-style network TypeError to the connection-hiccup message", () => {
    const err = new TypeError("Failed to fetch");
    expect(friendlyWriteError(err)).toBe(
      "Connection hiccup. Nothing was saved. Try again.",
    );
  });

  it("maps Safari's exact 'Load failed' message to the connection-hiccup message", () => {
    const err = new TypeError("Load failed");
    expect(friendlyWriteError(err)).toBe(
      "Connection hiccup. Nothing was saved. Try again.",
    );
  });

  it("passes through a plain Error's message when not offline-shaped", () => {
    const err = new Error("row-level security violation");
    expect(friendlyWriteError(err)).toBe("row-level security violation");
  });

  it("falls back to a generic message when the error has no message", () => {
    const err = new Error("");
    expect(friendlyWriteError(err)).toBe("Something went wrong.");
  });

  it("falls back to a generic message for a non-Error value", () => {
    expect(friendlyWriteError("nope")).toBe("Something went wrong.");
  });
});

describe("isLikelyOfflineError (Safari 'Load failed' addition)", () => {
  it("still matches the existing 'failed to fetch' network message", () => {
    expect(isLikelyOfflineError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("matches Safari's exact 'Load failed' TypeError", () => {
    expect(isLikelyOfflineError(new TypeError("Load failed"))).toBe(true);
  });

  it("does not match an unrelated TypeError", () => {
    expect(isLikelyOfflineError(new TypeError("Cannot read properties of undefined"))).toBe(
      false,
    );
  });

  it("does not match a plain Error", () => {
    expect(isLikelyOfflineError(new Error("row-level security violation"))).toBe(false);
  });
});
