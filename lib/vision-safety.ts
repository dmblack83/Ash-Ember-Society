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
 * strict   — profile avatars, forum posts, cigar-catalog submissions.
 *            Blocks if ANY of adult / racy / violence is VERY_LIKELY.
 *            These surfaces are user-displayed in social contexts and
 *            need a tighter bar.
 *
 * moderate — burn-report photos. Cigar close-ups (ash, wrapper, hands
 *            in frame, smoke, ember) routinely trip Vision channels
 *            individually even on legitimate content: "racy" misreads
 *            skin in close-up, "violence" misreads fire/ember, and
 *            "adult" can fire on warm tones + skin texture. Single-
 *            channel false positives are common.
 *
 *            Moderate ONLY blocks when at least TWO of the three
 *            channels (adult, racy, violence) are VERY_LIKELY
 *            simultaneously — multi-channel agreement is the
 *            high-confidence signal. POSSIBLE and LIKELY scores never
 *            block. This is the "extreme content only" bar: real
 *            NSFW imagery trips multiple channels; cigar photos do
 *            not.
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
  /*
   * Server-side log on every check. Surfaces the policy and channel
   * scores in Vercel logs so we can see what Vision actually returned
   * when a user reports a "still being moderated" failure.
   */
  console.log("[vision-safety] check", { policy, scores });

  if (policy === "strict") {
    const failing =
      rank(scores.adult)    >= rank("VERY_LIKELY") ? "adult" :
      rank(scores.racy)     >= rank("VERY_LIKELY") ? "racy" :
      rank(scores.violence) >= rank("VERY_LIKELY") ? "violence" :
      null;
    if (failing) {
      passed = false;
      reason = `Image did not pass content moderation (${failing}: ${scores[failing]}).`;
    }
  } else {
    /*
     * moderate — multi-channel agreement at VERY_LIKELY. Single-
     * channel hits are too noisy on cigar close-ups (Vision misreads
     * skin / smoke / ember). Block only when 2+ of {adult, racy,
     * violence} are simultaneously VERY_LIKELY — that's the
     * "high-confidence, extreme content" bar.
     */
    const hits: string[] = [];
    if (rank(scores.adult)    >= rank("VERY_LIKELY")) hits.push("adult");
    if (rank(scores.racy)     >= rank("VERY_LIKELY")) hits.push("racy");
    if (rank(scores.violence) >= rank("VERY_LIKELY")) hits.push("violence");
    if (hits.length >= 2) {
      passed = false;
      const detail = hits.map((h) => `${h}: ${scores[h]}`).join(", ");
      reason = `Image did not pass content moderation (${detail}).`;
    }
  }

  if (!passed) {
    console.warn("[vision-safety] BLOCKED", { policy, scores, reason });
  }

  return { passed, reason, scores };
}
