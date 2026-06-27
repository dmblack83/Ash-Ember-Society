import { describe, it, expect } from "vitest";
import {
  decideResumeWork,
  decideStaleRevive,
  MIN_RESUME_INTERVAL_MS,
  RESUME_REFRESH_THRESHOLD_MS,
  HEARTBEAT_STALE_MS,
  type ResumeInput,
  type ResumeEffect,
} from "../resume-work";

const NOW = 10_000_000;

const base: ResumeInput = {
  online: true,
  iosStandalone: true,
  now: NOW,
  lastResumeAt: 0,
  // Hidden long enough ago to clear the gap gate by default.
  hiddenAt: NOW - RESUME_REFRESH_THRESHOLD_MS,
};

describe("decideResumeWork", () => {
  it("does no work when offline", () => {
    expect(decideResumeWork({ ...base, online: false })).toEqual({
      act: false,
      effects: [],
    });
  });

  it("does no work when throttled (resumed again too soon)", () => {
    expect(
      decideResumeWork({
        ...base,
        lastResumeAt: NOW - (MIN_RESUME_INTERVAL_MS - 1),
      }),
    ).toEqual({ act: false, effects: [] });
  });

  it("does no work when no hide was recorded in this JS context", () => {
    expect(decideResumeWork({ ...base, hiddenAt: null })).toEqual({
      act: false,
      effects: [],
    });
  });

  it("does no work for a short background gap (quick app switch)", () => {
    expect(
      decideResumeWork({
        ...base,
        hiddenAt: NOW - (RESUME_REFRESH_THRESHOLD_MS - 1),
      }),
    ).toEqual({ act: false, effects: [] });
  });

  it("after a meaningful gap on iOS standalone, warms auth and checks for a new SW", () => {
    expect(decideResumeWork(base)).toEqual({
      act: true,
      effects: ["refresh-session", "service-worker-update"],
    });
  });

  it("after a meaningful gap off iOS, only checks for a new SW (no auth pre-warm)", () => {
    expect(decideResumeWork({ ...base, iosStandalone: false })).toEqual({
      act: true,
      effects: ["service-worker-update"],
    });
  });

  it("REGRESSION (Option 1): resume work never includes a blocking router refresh / reload", () => {
    // router.refresh() on resume left the App Router pending on a cold
    // socket (~15s), queuing navigation to server-coupled routes. Resume
    // work must stay limited to non-blocking, fire-and-forget effects.
    const allowed: ResumeEffect[] = ["refresh-session", "service-worker-update"];
    for (const iosStandalone of [true, false]) {
      const work = decideResumeWork({ ...base, iosStandalone });
      for (const effect of work.effects) {
        expect(allowed).toContain(effect);
      }
    }
  });
});

describe("decideStaleRevive", () => {
  it("does not revive off iOS standalone", () => {
    expect(
      decideStaleRevive({ iosStandalone: false, lastHeartbeat: NOW - HEARTBEAT_STALE_MS - 1, now: NOW }),
    ).toEqual({ reviveStale: false });
  });

  it("does not revive when there is no prior heartbeat signal", () => {
    expect(
      decideStaleRevive({ iosStandalone: true, lastHeartbeat: 0, now: NOW }),
    ).toEqual({ reviveStale: false });
  });

  it("does not revive when the heartbeat is still fresh", () => {
    expect(
      decideStaleRevive({ iosStandalone: true, lastHeartbeat: NOW - (HEARTBEAT_STALE_MS - 1), now: NOW }),
    ).toEqual({ reviveStale: false });
  });

  it("does not revive at exactly the stale threshold (strict >)", () => {
    expect(
      decideStaleRevive({ iosStandalone: true, lastHeartbeat: NOW - HEARTBEAT_STALE_MS, now: NOW }),
    ).toEqual({ reviveStale: false });
  });

  it("revives when the heartbeat is stale (JS was likely dead a while)", () => {
    expect(
      decideStaleRevive({ iosStandalone: true, lastHeartbeat: NOW - HEARTBEAT_STALE_MS - 1, now: NOW }),
    ).toEqual({ reviveStale: true });
  });
});
