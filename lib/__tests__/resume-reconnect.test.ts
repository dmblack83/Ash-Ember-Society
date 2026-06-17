import { describe, it, expect } from "vitest";
import {
  classifyProbeError,
  decideReconnect,
  MAX_RELOADS_PER_SESSION,
  RELOAD_COOLDOWN_MS,
  type ReconnectInput,
} from "../resume-reconnect";

const base: ReconnectInput = {
  online: true,
  probeResult: "timeout",
  reloadCount: 0,
  lastReloadAt: 0,
  now: 1_000_000,
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
  it("reloads when the probe times out, online, within cap and cooldown", () => {
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

  it("stops reloading once the per-session cap is reached", () => {
    expect(
      decideReconnect({ ...base, reloadCount: MAX_RELOADS_PER_SESSION }),
    ).toEqual({ action: "none", reason: "capped" });
  });

  it("respects the cooldown between reloads", () => {
    expect(
      decideReconnect({
        ...base,
        reloadCount: 1,
        lastReloadAt: base.now - (RELOAD_COOLDOWN_MS - 1),
      }),
    ).toEqual({ action: "none", reason: "cooldown" });
  });

  it("reloads again after the cooldown elapses and under the cap", () => {
    expect(
      decideReconnect({
        ...base,
        reloadCount: 1,
        lastReloadAt: base.now - RELOAD_COOLDOWN_MS,
      }),
    ).toEqual({ action: "reload" });
  });
});
