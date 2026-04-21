import { NextRequest, NextResponse } from "next/server";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";

/* ------------------------------------------------------------------
   Vision client — lazy singleton to avoid build-time crash.
   Next.js runs module-level code during static analysis before env
   vars are available, so we initialize only on first request.
   ------------------------------------------------------------------ */

let _visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (!_visionClient) {
    const raw = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS;
    if (!raw) throw new Error("GOOGLE_CLOUD_VISION_CREDENTIALS is not set");
    const credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    _visionClient = new ImageAnnotatorClient({ credentials });
  }
  return _visionClient;
}

/* ------------------------------------------------------------------
   Likelihood enum normalization.
   The Vision API types safety annotation fields as string | Likelihood
   where Likelihood is a numeric proto enum (0–5). We normalize to the
   string name so downstream logic only deals with strings.
   ------------------------------------------------------------------ */

const LIKELIHOOD_NAMES = [
  "UNKNOWN",
  "VERY_UNLIKELY",
  "UNLIKELY",
  "POSSIBLE",
  "LIKELY",
  "VERY_LIKELY",
] as const;

type LikelihoodName = (typeof LIKELIHOOD_NAMES)[number];

function likelihoodToString(
  val: string | number | null | undefined
): LikelihoodName {
  if (val == null) return "UNKNOWN";
  if (typeof val === "number") return LIKELIHOOD_NAMES[val] ?? "UNKNOWN";
  return (LIKELIHOOD_NAMES.includes(val as LikelihoodName)
    ? val
    : "UNKNOWN") as LikelihoodName;
}

/* ------------------------------------------------------------------
   Safety score types and policies
   ------------------------------------------------------------------ */

interface SafetyScores {
  adult:    LikelihoodName;
  violence: LikelihoodName;
  racy:     LikelihoodName;
}

function rank(name: LikelihoodName): number {
  return LIKELIHOOD_NAMES.indexOf(name);
}

/** Strict: block LIKELY+ adult/violence, VERY_LIKELY+ racy */
function failsStrict(s: SafetyScores): boolean {
  return (
    rank(s.adult)    >= rank("LIKELY") ||
    rank(s.violence) >= rank("LIKELY") ||
    rank(s.racy)     >= rank("VERY_LIKELY")
  );
}

/** Moderate: block VERY_LIKELY adult/violence/racy */
function failsModerate(s: SafetyScores): boolean {
  return (
    rank(s.adult)    >= rank("VERY_LIKELY") ||
    rank(s.violence) >= rank("VERY_LIKELY") ||
    rank(s.racy)     >= rank("VERY_LIKELY")
  );
}

/* ------------------------------------------------------------------
   Supported image types
   ------------------------------------------------------------------ */

type ImageType = "cigar_band" | "profile_image" | "blog_image";

const VALID_TYPES = new Set<ImageType>(["cigar_band", "profile_image", "blog_image"]);

/* ------------------------------------------------------------------
   POST /api/vision/analyze
   Body: { type: ImageType; imageBase64: string }
   Returns: { passed: boolean; ocrText?: string; safety: SafetyScores; reason?: string }
   ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  /* Auth — require signed-in user */
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* Parse body */
  let type: ImageType;
  let imageBase64: string;
  try {
    const body = await req.json();
    type        = body.type;
    imageBase64 = body.imageBase64;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${[...VALID_TYPES].join(", ")}` },
      { status: 400 }
    );
  }

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
  }

  /* Call Vision API */
  const client = getVisionClient();
  const imageContent = imageBase64; // already stripped of data-URI prefix by client

  let ocrText: string | undefined;
  let safety: SafetyScores;

  try {
    const [result] = await client.annotateImage({
      image:    { content: imageContent },
      features: [
        { type: "SAFE_SEARCH_DETECTION" as const },
        ...(type === "cigar_band" ? [{ type: "TEXT_DETECTION" as const }] : []),
      ],
    });

    /* OCR — cigar_band only */
    if (type === "cigar_band") {
      const annotations = result.textAnnotations;
      if (annotations && annotations.length > 0) {
        ocrText = annotations[0].description ?? undefined;
      }
    }

    /* Safety scores */
    const ss = result.safeSearchAnnotation ?? {};
    safety = {
      adult:    likelihoodToString(ss.adult),
      violence: likelihoodToString(ss.violence),
      racy:     likelihoodToString(ss.racy),
    };
  } catch (err) {
    console.error("[vision/analyze] Vision API error:", err);
    return NextResponse.json({ error: "Vision API request failed" }, { status: 502 });
  }

  /* Apply policy */
  const strictTypes   = new Set<ImageType>(["profile_image"]);
  const fails = strictTypes.has(type) ? failsStrict(safety) : failsModerate(safety);
  const passed = !fails;
  const reason = fails
    ? `Content blocked — adult:${safety.adult} violence:${safety.violence} racy:${safety.racy}`
    : undefined;

  /* Log to moderation_log via service client (bypasses RLS) */
  try {
    const serviceClient = createServiceClient();
    await serviceClient.from("moderation_log").insert({
      user_id:       user.id,
      type,
      passed,
      safety_scores: safety,
      reason:        reason ?? null,
    });
  } catch (err) {
    /* Non-fatal — log and continue */
    console.error("[vision/analyze] Failed to write moderation_log:", err);
  }

  return NextResponse.json({
    passed,
    ...(ocrText !== undefined ? { ocrText } : {}),
    safety,
    ...(reason ? { reason } : {}),
  });
}
