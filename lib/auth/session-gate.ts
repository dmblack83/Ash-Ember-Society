/**
 * Pure redirect decision for the authed zone, mirroring proxy.ts gating.
 *
 * Used by per-route client guards (e.g. HumidorRoute) so the
 * static-shell routes enforce the same rules the proxy enforces
 * server-side. Pure + synchronous so it is unit-testable.
 */

export type SessionGate = "login" | "onboarding" | "allow";

export function resolveSessionGate(input: {
  hasSession: boolean;
  onboardingCompleted: boolean;
  pathname: string;
}): SessionGate {
  const { hasSession, onboardingCompleted, pathname } = input;
  if (!hasSession) return "login";
  if (!onboardingCompleted && !pathname.startsWith("/onboarding")) return "onboarding";
  return "allow";
}
