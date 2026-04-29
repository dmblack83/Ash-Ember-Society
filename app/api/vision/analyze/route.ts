import { NextRequest, NextResponse } from "next/server";
import { ImageAnnotatorClient }      from "@google-cloud/vision";
import { createClient }              from "@/utils/supabase/server";
import { createServiceClient }       from "@/utils/supabase/service";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

type AnalysisType = "cigar_band" | "profile_image" | "blog_image";

interface RequestBody {
  image: string;       // base64-encoded image data (no data-URI prefix)
  type:  AnalysisType;
}

interface SafetyScores {
  adult:    string;
  violence: string;
  racy:     string;
  spoof:    string;
  medical:  string;
}

/* ------------------------------------------------------------------
   Vision client — lazy singleton
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
   Safety helpers
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

/** strict — profile images */
function failsStrict(s: SafetyScores): boolean {
  return (
    rank(s.adult)    >= rank("LIKELY") ||
    rank(s.violence) >= rank("LIKELY") ||
    rank(s.racy)     >= rank("VERY_LIKELY")
  );
}

/** moderate — blog images */
function failsModerate(s: SafetyScores): boolean {
  return (
    rank(s.adult)    >= rank("VERY_LIKELY") ||
    rank(s.violence) >= rank("VERY_LIKELY") ||
    rank(s.racy)     >= rank("VERY_LIKELY")
  );
}

/* ------------------------------------------------------------------
   POST /api/vision/analyze
   ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  /* ── Auth ─────────────────────────────────────────────────────── */
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ── Parse body ───────────────────────────────────────────────── */
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { image, type } = body;
  if (!image || !type) {
    return NextResponse.json({ error: "Missing image or type" }, { status: 400 });
  }

  const validTypes: AnalysisType[] = ["cigar_band", "profile_image", "blog_image"];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  /* ── Call Vision API ──────────────────────────────────────────── */
  // cigar_band: OCR only — no safety scan (camera captures of cigar bands, not user-chosen content)
  // profile_image / blog_image: safety scan only
  const features =
    type === "cigar_band"
      ? [{ type: "TEXT_DETECTION" as const }]
      : [{ type: "SAFE_SEARCH_DETECTION" as const }];

  let visionResult;
  try {
    [visionResult] = await getVisionClient().annotateImage({
      image:    { content: image },
      features,
    });
  } catch (err) {
    console.error("[vision/analyze] Vision API error:", err);
    return NextResponse.json({ error: "Vision API call failed" }, { status: 502 });
  }

  /* ── OCR text (cigar_band only) ───────────────────────────────── */
  if (type === "cigar_band") {
    const ocrText = visionResult.textAnnotations?.[0]?.description ?? "";
    return NextResponse.json({ ocrText });
  }

  /* ── Safety scores (profile_image / blog_image) ───────────────── */
  const ss = visionResult.safeSearchAnnotation ?? {};
  const safety: SafetyScores = {
    adult:    likelihoodToString(ss.adult),
    violence: likelihoodToString(ss.violence),
    racy:     likelihoodToString(ss.racy),
    spoof:    likelihoodToString(ss.spoof),
    medical:  likelihoodToString(ss.medical),
  };

  let passed = true;
  let reason: string | undefined;

  if (type === "profile_image" && failsStrict(safety)) {
    passed = false;
    reason = "Image did not pass content moderation.";
  } else if (type === "blog_image" && failsModerate(safety)) {
    passed = false;
    reason = "Image did not pass content moderation.";
  }

  /* ── Log to moderation_log ────────────────────────────────────── */
  try {
    const service = createServiceClient();
    await service.from("moderation_log").insert({
      user_id:       user.id,
      type,
      passed,
      safety_scores: safety,
      reason:        reason ?? null,
    });
  } catch (err) {
    console.error("[vision/analyze] Failed to write moderation_log:", err);
  }

  return NextResponse.json({
    passed,
    safety,
    ...(reason && { reason }),
  });
}
