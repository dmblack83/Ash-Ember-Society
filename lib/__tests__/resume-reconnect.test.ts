import { describe, it, expect } from "vitest";
import {
  classifyProbeError,
  decideReconnect,
  MAX_RELOADS_PER_WINDOW,
  RELOAD_WINDOW_MS,
  RELOAD_COOLDOWN_MS,
  type ReconnectInput,
} from "../resume-reconnect";

const NOW = 10_000_000;

const base: ReconnectInput = {
  online: true,
  probeResult: "timeout",
  recentReloadTimestamps: [],
  now: NOW,
};

describe("classifyProbeError", () => {
  it("treats TimeoutError as a stall (timeout)", () => {
    expect(classifyProbeError("TimeoutError")).toBe("timeout");
  });

  it("treats AbortError as a stall (timeout)", () => {
    expect(classifyProbeError("AbortError")).toBe("timeout");
  });

  it("treats a generic fetch failure as a fast error", () => {
    expect(classifyProbeError("TypeError")).toBe("error");
  });

  it("treats an undefined error name as a fast error", () => {
    expect(classifyProbeError(undefined)).toBe("error");
  });
});

describe("decideReconnect", () => {
  it("reloads when the probe times out, online, with no recent reloads", () => {
    expect(decideReconnect(base)).toEqual({ action: "reload" });
  });

  it("does nothing when the connection is healthy", () => {
    expect(decideReconnect({ ...base, probeResult: "ok" })).toEqual({
      action: "none",
      reason: "healthy",
    });
  });

  it("does nothing on a fast network error (avoids reload-into-offline loop)", () => {
    expect(decideReconnect({ ...base, probeResult: "error" })).toEqual({
      action: "none",
      reason: "fast_error",
    });
  });

  it("does nothing when offline", () => {
    expect(decideReconnect({ ...base, online: false })).toEqual({
      action: "none",
      reason: "offline",
    });
  });

  it("respects the cooldown after a very recent reload", () => {
    expect(
      decideReconnect({
        ...base,
        recentReloadTimestamps: [NOW - (RELOAD_COOLDOWN_MS - 1)],
      }),
    ).toEqual({ action: "none", reason: "cooldown" });
  });

  it("reloads again once the cooldown has elapsed", () => {
    expect(
      decideReconnect({
        ...base,
        recentReloadTimestamps: [NOW - RELOAD_COOLDOWN_MS],
      }),
    ).toEqual({ action: "reload" });
  });

  it("rate-limits when too many reloads happened inside the window", () => {
    // MAX reloads, all inside the window and outside the cooldown → loop guard
    const inside = Array.from(
      { length: MAX_RELOADS_PER_WINDOW },
      (_, i) => NOW - RELOAD_COOLDOWN_MS - i * 1000,
    );
    expect(
      decideReconnect({ ...base, recentReloadTimestamps: inside }),
    ).toEqual({ action: "none", reason: "rate_limited" });
  });

  it("REGRESSION: reloads again after the window has passed (budget refills)", () => {
    // The old lifetime cap never reset, so an iOS PWA that accumulated
    // MAX reloads was stuck hanging forever. Reloads older than the window
    // must no longer count against the budget.
    const old = Array.from(
      { length: MAX_RELOADS_PER_WINDOW + 2 },
      (_, i) => NOW - RELOAD_WINDOW_MS - 1 - i * 1000,
    );
    expect(decideReconnect({ ...base, recentReloadTimestamps: old })).toEqual({
      action: "reload",
    });
  });

  it("counts only in-window reloads toward the cap", () => {
    // One stale (out of window) + (MAX - 1) recent = under cap → still reloads
    const mixed = [
      NOW - RELOAD_WINDOW_MS - 5000, // stale, ignored
      ...Array.from(
        { length: MAX_RELOADS_PER_WINDOW - 1 },
        (_, i) => NOW - RELOAD_COOLDOWN_MS - i * 1000,
      ),
    ];
    expect(
      decideReconnect({ ...base, recentReloadTimestamps: mixed }),
    ).toEqual({ action: "reload" });
  });
});
