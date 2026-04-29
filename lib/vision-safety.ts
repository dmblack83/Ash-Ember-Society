import { ImageAnnotatorClient } from "@google-cloud/vision";

/* ------------------------------------------------------------------
   Singleton Vision client
   ------------------------------------------------------------------ */

let _client: ImageAnnotatorClient | null = null;

function getClient(): ImageAnnotatorClient {
  if (!_client) {
    const raw = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS;
    if (!raw) throw new Error("GOOGLE_CLOUD_VISION_CREDENTIALS is not set");
    const credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    _client = new ImageAnnotatorClient({ credentials });
  }
  return _client;
}

/* ------------------------------------------------------------------
   Likelihood helpers
   ------------------------------------------------------------------ */

const LIKELIHOOD_NAMES = [
  "UNKNOWN",
  "VERY_UNLIKELY",
  "UNLIKELY",
  "POSSIBLE",
  "LIKELY",
  "VERY_LIKELY",
] as const;

const LIKELIHOOD_RANK: Record<string, number> = Object.fromEntries(
  LIKELIHOOD_NAMES.map((n, i) => [n, i])
);

function likelihoodToString(val: string | number | null | undefined): string {
  if (val == null) return "UNKNOWN";
  if (typeof val === "number") return LIKELIHOOD_NAMES[val] ?? "UNKNOWN";
  return val;
}

function rank(level: string): number {
  return LIKELIHOOD_RANK[level] ?? 0;
}

/* ------------------------------------------------------------------
   Public API
   ------------------------------------------------------------------ */

export type SafetyPolicy = "strict" | "moderate";

export interface SafetyResult {
  passed:  boolean;
  reason?: string;
  scores:  Record<string, string>;
}

/**
 * Runs SAFE_SEARCH_DETECTION on a base64-encoded image.
 *
 * strict   — profile images: adult/violence LIKELY+, racy VERY_LIKELY+
 * moderate — other content:  adult/violence/racy VERY_LIKELY+
 */
export async function checkImageSafety(
  base64: string,
  policy: SafetyPolicy,
): Promise<SafetyResult> {
  let result;
  try {
    [result] = await getClient().annotateImage({
      image:    { content: base64 },
      features: [{ type: "SAFE_SEARCH_DETECTION" as const }],
    });
  } catch (err) {
    console.error("[vision-safety] Vision API error:", err);
    throw err;
  }

  const ss = result.safeSearchAnnotation ?? {};
  const scores: Record<string, string> = {
    adult:    likelihoodToString(ss.adult),
    violence: likelihoodToString(ss.violence),
    racy:     likelihoodToString(ss.racy),
    spoof:    likelihoodToString(ss.spoof),
    medical:  likelihoodToString(ss.medical),
  };

  let passed = true;
  let reason: string | undefined;

  if (policy === "strict") {
    if (
      rank(scores.adult)    >= rank("LIKELY")      ||
      rank(scores.violence) >= rank("LIKELY")      ||
      rank(scores.racy)     >= rank("VERY_LIKELY")
    ) {
      passed = false;
      reason = "Image did not pass content moderation.";
    }
  } else {
    if (
      rank(scores.adult)    >= rank("VERY_LIKELY") ||
      rank(scores.violence) >= rank("VERY_LIKELY") ||
      rank(scores.racy)     >= rank("VERY_LIKELY")
    ) {
      passed = false;
      reason = "Image did not pass content moderation.";
    }
  }

  return { passed, reason, scores };
}
