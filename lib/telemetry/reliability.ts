import * as Sentry from "@sentry/nextjs";

export type ReliabilityBucket =
  | "sw_lifecycle"
  | "auth_session"
  | "network_resilience"
  | "ios_webkit"
  | "state_persistence";

export type ReliabilitySubtype =
  // sw_lifecycle
  | "activate_fail"
  | "precache_fail"
  | "nav_cache_stale"
  | "update_banner_cycle"
  // auth_session
  | "jwt_verify_fail"
  | "proxy_auth_timeout"
  | "cookie_domain_mismatch"
  | "oauth_host_drift"
  // network_resilience
  | "body_too_large"
  | "outbox_replay_fail"
  | "fetch_timeout"
  | "chunk_load_error"
  // ios_webkit
  | "splash_fail"
  | "scope_violation"
  | "redirect_loop"
  | "hydration_watchdog_fired"
  // state_persistence
  | "draft_save_fail"
  | "optimistic_rollback"
  | "edit_dropped";

export interface ReliabilityEvent {
  bucket:  ReliabilityBucket;
  subtype: ReliabilitySubtype;
  cause?:  string;
  detail?: string;
  extra?:  Record<string, string | number | boolean>;
}

export function trackReliability(e: ReliabilityEvent): void {
  Sentry.captureMessage(`reliability:${e.bucket}.${e.subtype}`, {
    level: "warning",
    tags: {
      type:    "reliability",
      bucket:  e.bucket,
      subtype: e.subtype,
      cause:   e.cause ?? "unknown",
    },
    extra: {
      ...(e.detail !== undefined && { detail: e.detail.slice(0, 200) }),
      ...e.extra,
    },
  });
}
