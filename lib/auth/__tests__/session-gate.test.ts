import { describe, it, expect } from "vitest";
import { resolveSessionGate } from "@/lib/auth/session-gate";

describe("resolveSessionGate", () => {
  it("sends an unauthenticated user to login", () => {
    expect(resolveSessionGate({ hasSession: false, onboardingCompleted: false, pathname: "/humidor" }))
      .toBe("login");
    expect(resolveSessionGate({ hasSession: false, onboardingCompleted: true, pathname: "/humidor" }))
      .toBe("login");
  });

  it("sends an onboarding-incomplete user to onboarding from a normal route", () => {
    expect(resolveSessionGate({ hasSession: true, onboardingCompleted: false, pathname: "/humidor" }))
      .toBe("onboarding");
  });

  it("allows an onboarding-incomplete user to stay on the onboarding route", () => {
    expect(resolveSessionGate({ hasSession: true, onboardingCompleted: false, pathname: "/onboarding" }))
      .toBe("allow");
    expect(resolveSessionGate({ hasSession: true, onboardingCompleted: false, pathname: "/onboarding/step-2" }))
      .toBe("allow");
  });

  it("allows a fully authenticated user", () => {
    expect(resolveSessionGate({ hasSession: true, onboardingCompleted: true, pathname: "/humidor" }))
      .toBe("allow");
  });
});
