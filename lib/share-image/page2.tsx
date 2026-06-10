import React from "react";
import { T } from "./tokens";
import { clampText } from "./helpers";
import type { ShareImageProps } from "./types";

/* Char clamps tuned to keep a dense report inside the square at the new
   type scale. If a dense sample still gets scaled down by the square step,
   lower these (and re-run the sample script). */
const REVIEW_MAX_CHARS = 320;
const THIRD_MAX_CHARS  = 180;

function Masthead({ parts }: { parts: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginBottom: 24 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "8px 0" }}>
        <p style={{ fontFamily: T.mono, fontSize: T.type.meta, fontWeight: 500, letterSpacing: "0.32em",
          textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
          {parts.join(" · ")}
        </p>
      </div>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
    </div>
  );
}

function Footer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 24 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "10px 0" }}>
        <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.32em",
          textTransform: "uppercase", color: T.goldFooter, margin: 0 }}>
          ASH & EMBER · WWW.ASHEMBER.VIP
        </p>
      </div>
    </div>
  );
}

export function buildPage2(p: ShareImageProps): React.ReactElement {
  const firstName = (p.displayName?.trim().split(/\s+/)[0] ?? "").toUpperCase() || null;
  const cityUpper = p.city?.trim().toUpperCase() || null;

  const smokedDate = new Date(
    p.smokedAt.length === 10 ? p.smokedAt + "T00:00:00" : p.smokedAt
  );
  const mastheadDate = smokedDate
    .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })
    .toUpperCase()
    .replace(",", "");
  const mastheadParts = [
    "Burn Report",
    p.reportNumber != null ? `No. ${p.reportNumber}` : null,
    mastheadDate,
  ].filter(Boolean) as string[];

  const anyThird =
    p.thirdsEnabled &&
    (p.thirdBeginning?.trim() || p.thirdMiddle?.trim() || p.thirdEnd?.trim());
  const review = clampText(p.reviewText, REVIEW_MAX_CHARS);

  const THIRD_DEFS: Array<{ label: string; text: string | null; idx: 1 | 2 | 3 }> = [
    { label: "FIRST THIRD · BEGINNING", text: p.thirdBeginning, idx: 1 },
    { label: "SECOND THIRD · MIDDLE",   text: p.thirdMiddle,    idx: 2 },
    { label: "FINAL THIRD · END",       text: p.thirdEnd,       idx: 3 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", width: T.IMAGE_WIDTH,
      backgroundColor: T.background, padding: T.outerPad }}>
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: T.card,
        border: `1px solid ${T.line}`, borderRadius: 4, padding: T.cardPad }}>

        <Masthead parts={mastheadParts} />

        {/* Thirds */}
        {anyThird && (
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 24,
            paddingBottom: 24, borderBottom: `1px dashed ${T.lineSoft}` }}>
            {THIRD_DEFS.map(({ label, text, idx }) => {
              const t         = clampText(text, THIRD_MAX_CHARS);
              const chipNames = p.thirdsTaggedRows.find((r) => r.index === idx)?.flavor_tag_names ?? [];
              return (
                <div key={label} style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
                  <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.28em",
                    textTransform: "uppercase", color: T.gold, margin: 0 }}>
                    {label}
                  </p>
                  <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.prose, lineHeight: 1.4,
                    color: t ? T.foreground : T.paperDim, margin: "6px 0 0" }}>
                    {t || "—"}
                  </p>
                  {chipNames.length > 0 && (
                    <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.chip,
                      lineHeight: 1.5, color: T.paperMute, margin: "6px 0 0" }}>
                      {chipNames.map((name, i) => (
                        <React.Fragment key={name}>
                          {name.toLowerCase()}
                          {i < chipNames.length - 1 && (
                            <> <span style={{ color: T.gold }}> · </span> </>
                          )}
                        </React.Fragment>
                      ))}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pull quote */}
        {review && (
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.quote, fontWeight: 500,
                lineHeight: 1, color: T.gold, opacity: 0.85, marginTop: -10, flexShrink: 0 }}>
                &ldquo;
              </span>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 12 }}>
                <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.body, lineHeight: 1.5,
                  color: T.foreground, margin: 0 }}>
                  {review}
                </p>
                {(firstName || cityUpper) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                    <div style={{ width: 28, height: 1, background: T.goldDeep, flexShrink: 0 }} />
                    <p style={{ fontFamily: T.mono, fontSize: T.type.meta, fontWeight: 500,
                      letterSpacing: "0.22em", textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
                      {[firstName, cityUpper].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tasting Notes */}
        {p.flavorTagNames.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 28, height: 1, background: T.goldDeep, flexShrink: 0 }} />
              <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.28em",
                textTransform: "uppercase", color: T.gold, margin: 0 }}>
                TASTING NOTES
              </p>
              <div style={{ width: 28, height: 1, background: T.goldDeep, flexShrink: 0 }} />
            </div>
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.prose, lineHeight: 1.5,
              color: T.paperMute, textAlign: "center", margin: "10px 0 0" }}>
              {p.flavorTagNames.map((name, i) => (
                <React.Fragment key={name}>
                  {name.toLowerCase()}
                  {i < p.flavorTagNames.length - 1 && (
                    <> <span style={{ color: T.gold }}> · </span> </>
                  )}
                </React.Fragment>
              ))}
            </p>
          </div>
        )}

        {/* Spec strip */}
        <div style={{ display: "flex", gap: 10, paddingTop: 22, borderTop: `1px solid ${T.lineSoft}` }}>
          {([
            ["DURATION", p.smokeDurationMinutes != null ? `${p.smokeDurationMinutes} min` : "—"],
            ["PAIRING",  p.pairingDrink?.trim() || "—"],
            ["OCCASION", p.occasion?.trim()     || "—"],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column",
              alignItems: "center", flex: 1 }}>
              <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.22em",
                textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
                {label}
              </p>
              <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.body, fontWeight: 500,
                color: T.foreground, margin: "6px 0 0", lineHeight: 1.2 }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <Footer />
      </div>
    </div>
  );
}
