import { Ratelimit } from "@upstash/ratelimit";
import { Redis }     from "@upstash/redis";

/* ------------------------------------------------------------------
   Per-identifier sliding-window rate limit, shared across all routes.

   Backed by Upstash Redis (HTTP REST API — Edge-runtime compatible,
   no connection pool). Marketplace install on Vercel auto-injects
   UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.

   Failure modes when env vars are missing:

     production  → fails CLOSED (returns ok: false with reason
                   "rate_limit_unavailable"). Forces explicit
                   configuration before the route can serve traffic.
                   Surfaces a console.error so monitoring picks it up.

     development → warns once per process, then passes through. Avoids
                   forcing a Marketplace install for local dev.

   Limiter instances are cached per (prefix, limit, window) tuple so
   repeated calls don't reconstruct the Ratelimit object.
   ------------------------------------------------------------------ */

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

export interface RateLimitConfig {
  /** Requests allowed within the window. */
  limit:  number;
  /** Window expressed for Upstash's parser, e.g. "1 h", "10 m", "30 s". */
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  /** Per-route key prefix; prevents collisions when the same identifier
      is rate-limited across multiple endpoints. */
  prefix: string;
}

export interface RateLimitResult {
  ok:        boolean;
  limit:     number;
  remaining: number;
  /** Unix millis when the current window resets. */
  reset:     number;
  reason?:   "rate_limit_exceeded" | "rate_limit_unavailable";
}

const _limiters = new Map<string, Ratelimit>();

function getLimiter(config: RateLimitConfig): Ratelimit | null {
  const cacheKey = `${config.prefix}:${config.limit}:${config.window}`;
  const cached   = _limiters.get(cacheKey);
  if (cached) return cached;

  const redis = getRedis();
  if (!redis) return null;

  const limiter = new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(config.limit, config.window),
    prefix:    config.prefix,
    analytics: true,
  });
  _limiters.set(cacheKey, limiter);
  return limiter;
}

let _warnedMissingEnv = false;

export async function checkRateLimit(
  identifier: string,
  config:     RateLimitConfig,
): Promise<RateLimitResult> {
  const limiter = getLimiter(config);

  if (!limiter) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[rate-limit] CRITICAL: "${config.prefix}" was called but UPSTASH_REDIS_REST_URL ` +
        `or UPSTASH_REDIS_REST_TOKEN is not set. Failing closed. Install Upstash via the ` +
        `Vercel Marketplace to inject these env vars automatically.`,
      );
      return { ok: false, limit: 0, remaining: 0, reset: 0, reason: "rate_limit_unavailable" };
    }
    if (!_warnedMissingEnv) {
      console.warn(
        `[rate-limit] Upstash env vars not set; passing through in dev. Set ` +
        `UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable.`,
      );
      _warnedMissingEnv = true;
    }
    return { ok: true, limit: config.limit, remaining: config.limit, reset: 0 };
  }

  const result = await limiter.limit(identifier);
  return {
    ok:        result.success,
    limit:     result.limit,
    remaining: result.remaining,
    reset:     result.reset,
    reason:    result.success ? undefined : "rate_limit_exceeded",
  };
}
