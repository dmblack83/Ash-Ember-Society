import React from "react";
import type { BadgeType } from "@/lib/badge";

/* ------------------------------------------------------------------
   Each frame is a pure SVG fragment.
   Gradient / filter IDs are prefixed with "af-<badge>" so multiple
   frames of the same type on one page share identical definitions
   without cross-contaminating other SVG elements in the document.
   ------------------------------------------------------------------ */

function BetaTesterFrame() {
  return (
    <>
      <defs>
        <linearGradient id="af-beta-g" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#818CF8" />
          <stop offset="100%" stopColor="#C084FC" />
        </linearGradient>
        <filter id="af-beta-f">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="54" cy="54" r="51" stroke="rgba(129,140,248,0.2)" strokeWidth="1" strokeDasharray="3 6" />
      <path d="M 54,3 A 51,51 0 0 1 105,54" stroke="url(#af-beta-g)" strokeWidth="2.5" strokeLinecap="round" filter="url(#af-beta-f)" />
      <path d="M 105,54 A 51,51 0 0 1 54,105" stroke="url(#af-beta-g)" strokeWidth="2.5" strokeLinecap="round" filter="url(#af-beta-f)" />
      <path d="M 54,105 A 51,51 0 0 1 3,54"  stroke="url(#af-beta-g)" strokeWidth="2.5" strokeLinecap="round" filter="url(#af-beta-f)" />
      <path d="M 3,54 A 51,51 0 0 1 54,3"    stroke="url(#af-beta-g)" strokeWidth="2.5" strokeLinecap="round" filter="url(#af-beta-f)" />
      <circle cx="54"  cy="3"   r="3.5" fill="#C084FC" filter="url(#af-beta-f)" />
      <circle cx="105" cy="54"  r="3.5" fill="#818CF8" filter="url(#af-beta-f)" />
      <circle cx="54"  cy="105" r="3.5" fill="#C084FC" filter="url(#af-beta-f)" />
      <circle cx="3"   cy="54"  r="3.5" fill="#818CF8" filter="url(#af-beta-f)" />
      <line x1="54"  y1="3"  x2="54"  y2="-4"  stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="105" y1="54" x2="112" y2="54"  stroke="#818CF8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3"   y1="54" x2="-4"  y2="54"  stroke="#818CF8" strokeWidth="1.5" strokeLinecap="round" />
      <text x="54" y="109" textAnchor="middle" fontSize="7" fontFamily="Inter,sans-serif" fontWeight="700" fill="#C084FC" letterSpacing="1">β</text>
    </>
  );
}

function MemberFrame() {
  return (
    <>
      <defs>
        <linearGradient id="af-mem-g" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7C4A1A" />
          <stop offset="25%"  stopColor="#CD7F32" />
          <stop offset="50%"  stopColor="#E8975A" />
          <stop offset="75%"  stopColor="#CD7F32" />
          <stop offset="100%" stopColor="#7C4A1A" />
        </linearGradient>
        <linearGradient id="af-mem-g2" x1="108" y1="0" x2="0" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#E8975A" stopOpacity="0.6" />
          <stop offset="50%"  stopColor="#7C4A1A" stopOpacity="0" />
          <stop offset="100%" stopColor="#E8975A" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx="54" cy="54" r="48"   stroke="url(#af-mem-g)"  strokeWidth="5" />
      <circle cx="54" cy="54" r="48"   stroke="url(#af-mem-g2)" strokeWidth="3" />
      <circle cx="54" cy="54" r="50.5" stroke="rgba(80,30,5,0.4)"  strokeWidth="1" />
      <circle cx="54" cy="54" r="45.5" stroke="rgba(80,30,5,0.35)" strokeWidth="1" />
    </>
  );
}

function PremiumFrame() {
  return (
    <>
      <defs>
        <linearGradient id="af-prem-r" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#9A6210" />
          <stop offset="30%"  stopColor="#F0C65A" />
          <stop offset="60%"  stopColor="#D4A04A" />
          <stop offset="100%" stopColor="#9A6210" />
        </linearGradient>
      </defs>
      <circle cx="54" cy="54" r="48" stroke="url(#af-prem-r)"        strokeWidth="7"   strokeDasharray="7 4.8" strokeLinecap="round" />
      <circle cx="54" cy="54" r="48" stroke="rgba(15,5,0,0.72)"       strokeWidth="4"   strokeDasharray="7 4.8" strokeDashoffset="5.9" strokeLinecap="round" />
      <circle cx="54" cy="54" r="48" stroke="rgba(255,225,120,0.55)"  strokeWidth="2.5" strokeDasharray="7 4.8" strokeDashoffset="2.8" strokeLinecap="round" />
      <circle cx="54" cy="54" r="51.5" stroke="rgba(154,98,16,0.3)"   strokeWidth="1" />
      <circle cx="54" cy="54" r="44.5" stroke="rgba(154,98,16,0.25)"  strokeWidth="1" />
    </>
  );
}

function TopContributorFrame() {
  return (
    <>
      <defs>
        <linearGradient id="af-tc-g" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#9A6210" />
          <stop offset="50%"  stopColor="#F0C65A" />
          <stop offset="100%" stopColor="#9A6210" />
        </linearGradient>
        <linearGradient id="af-tc-e" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#9A3412" />
          <stop offset="50%"  stopColor="#F97316" />
          <stop offset="100%" stopColor="#9A3412" />
        </linearGradient>
      </defs>
      <circle cx="54" cy="54" r="48" stroke="url(#af-tc-g)"          strokeWidth="5.5" strokeDasharray="9 9"                     strokeLinecap="round" />
      <circle cx="54" cy="54" r="48" stroke="url(#af-tc-e)"          strokeWidth="5.5" strokeDasharray="9 9" strokeDashoffset="9"   strokeLinecap="round" />
      <circle cx="54" cy="54" r="48" stroke="rgba(10,3,0,0.65)"      strokeWidth="3"   strokeDasharray="9 9" strokeDashoffset="4.5" strokeLinecap="round" />
      <circle cx="54" cy="54" r="48" stroke="rgba(255,225,100,0.35)" strokeWidth="1.5" strokeDasharray="9 9" strokeDashoffset="2"   strokeLinecap="round" />
      <circle cx="54" cy="54" r="48" stroke="rgba(255,180,80,0.25)"  strokeWidth="1.5" strokeDasharray="9 9" strokeDashoffset="11"  strokeLinecap="round" />
      <circle cx="54" cy="54" r="51" stroke="rgba(212,160,74,0.2)"   strokeWidth="1" />
      <circle cx="54" cy="54" r="45" stroke="rgba(154,52,18,0.2)"    strokeWidth="1" />
      <circle cx="54" cy="6"   r="4" fill="#1A1210" stroke="url(#af-tc-g)" strokeWidth="1.5" />
      <circle cx="54" cy="6"   r="2" fill="#F0C65A" />
      <circle cx="54" cy="102" r="4" fill="#1A1210" stroke="url(#af-tc-e)" strokeWidth="1.5" />
      <circle cx="54" cy="102" r="2" fill="#F97316" />
    </>
  );
}

function ModeratorFrame() {
  return (
    <>
      <defs>
        <linearGradient id="af-mod-r" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#475569" />
          <stop offset="30%"  stopColor="#F1F5F9" />
          <stop offset="60%"  stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id="af-mod-sf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
        <linearGradient id="af-mod-ss" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#94A3B8" />
          <stop offset="50%"  stopColor="#F1F5F9" />
          <stop offset="100%" stopColor="#64748B" />
        </linearGradient>
      </defs>
      <circle cx="54" cy="54" r="48"   stroke="url(#af-mod-r)"       strokeWidth="7"   strokeDasharray="7 4.8" strokeLinecap="round" />
      <circle cx="54" cy="54" r="48"   stroke="rgba(10,14,20,0.72)"   strokeWidth="4"   strokeDasharray="7 4.8" strokeDashoffset="5.9" strokeLinecap="round" />
      <circle cx="54" cy="54" r="48"   stroke="rgba(241,245,249,0.55)" strokeWidth="2.5" strokeDasharray="7 4.8" strokeDashoffset="2.8" strokeLinecap="round" />
      <circle cx="54" cy="54" r="51.5" stroke="rgba(71,85,105,0.3)"   strokeWidth="1" />
      <circle cx="54" cy="54" r="44.5" stroke="rgba(71,85,105,0.25)"  strokeWidth="1" />
      <path d="M 42,90 L 42,104 Q 54,114 66,104 L 66,90 Q 60,94 54,94 Q 48,94 42,90 Z"
            fill="url(#af-mod-sf)" stroke="url(#af-mod-ss)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 46,92 L 46,103 Q 54,110 62,103 L 62,92 Q 58,95 54,95 Q 50,95 46,92 Z"
            fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <path d="M 46,92 Q 48,93 50,94 L 50,104 Q 48,101 46,98 Z" fill="rgba(255,255,255,0.08)" />
    </>
  );
}

function PartnerFrame() {
  return (
    <>
      <defs>
        <linearGradient id="af-part-g" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#9A6210" />
          <stop offset="40%"  stopColor="#F0C65A" />
          <stop offset="100%" stopColor="#9A6210" />
        </linearGradient>
      </defs>
      <circle cx="54" cy="54" r="47"   stroke="url(#af-part-g)"       strokeWidth="2" />
      <circle cx="54" cy="54" r="49.5" stroke="rgba(212,160,74,0.2)"  strokeWidth="1" />
      <circle cx="54" cy="54" r="44.5" stroke="rgba(154,98,16,0.2)"   strokeWidth="1" />
      <path d="M 54,101 Q 22,85 11,55"  stroke="url(#af-part-g)" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <path d="M 54,101 Q 86,85 97,55"  stroke="url(#af-part-g)" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <path d="M 40,100 C 44,97 50,99 54,102 C 58,99 64,97 68,100" stroke="url(#af-part-g)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="54" cy="102" r="3.5" fill="#D4A04A" stroke="#9A6210" strokeWidth="0.8" />
      <text x="54" y="6" textAnchor="middle" fontSize="7" fill="#D4A04A">✦</text>
    </>
  );
}

function FounderFrame() {
  return (
    <>
      <defs>
        <linearGradient id="af-founder-g" x1="0" y1="0" x2="140" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7A4A08" />
          <stop offset="25%"  stopColor="#F5D060" />
          <stop offset="50%"  stopColor="#FFF0A0" />
          <stop offset="75%"  stopColor="#E8B830" />
          <stop offset="100%" stopColor="#7A4A08" />
        </linearGradient>
        <linearGradient id="af-founder-g2" x1="140" y1="0" x2="0" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#FFF0A0" stopOpacity="0.5" />
          <stop offset="50%"  stopColor="#7A4A08"  stopOpacity="0" />
          <stop offset="100%" stopColor="#FFF0A0" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="af-founder-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#065F46" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="af-founder-ruby" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#FCA5A5" />
          <stop offset="100%" stopColor="#B91C1C" />
        </linearGradient>
        <linearGradient id="af-founder-emerald" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#6EE7B7" />
          <stop offset="100%" stopColor="#065F46" />
        </linearGradient>
        <filter id="af-founder-glow">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="af-founder-softglow">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Outer rule */}
      <circle cx="70" cy="70" r="65" stroke="url(#af-founder-g)" strokeWidth="0.8" opacity="0.6" />

      {/* Alternating gold / green Art Deco blocks */}
      <circle cx="70" cy="70" r="62" stroke="url(#af-founder-g)"     strokeWidth="6" strokeDasharray="5.5 5.5" strokeLinecap="butt" filter="url(#af-founder-softglow)" />
      <circle cx="70" cy="70" r="62" stroke="url(#af-founder-green)" strokeWidth="6" strokeDasharray="5.5 5.5" strokeDashoffset="5.5" strokeLinecap="butt" />
      {/* Sheen */}
      <circle cx="70" cy="70" r="62" stroke="url(#af-founder-g2)"    strokeWidth="4" strokeDasharray="11 0" strokeLinecap="butt" />

      {/* Inner rule */}
      <circle cx="70" cy="70" r="59" stroke="url(#af-founder-g)" strokeWidth="0.8" opacity="0.5" />

      {/* Top ornament */}
      <line x1="34" y1="8" x2="106" y2="8" stroke="url(#af-founder-g)" strokeWidth="1.2" opacity="0.8" />
      <path d="M 63,8 C 54,8 46,4 44,11 C 42,18 48,22 54,19 C 58,17 56,12 51,14"
            stroke="url(#af-founder-g)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="51" cy="14" r="2" fill="url(#af-founder-g)" opacity="0.8" />
      <path d="M 77,8 C 86,8 94,4 96,11 C 98,18 92,22 86,19 C 82,17 84,12 89,14"
            stroke="url(#af-founder-g)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="89" cy="14" r="2" fill="url(#af-founder-g)" opacity="0.8" />
      {/* Top diamond medallion */}
      <polygon points="70,0 78,8 70,16 62,8"   fill="#0A0806" stroke="url(#af-founder-g)" strokeWidth="1.2" />
      <polygon points="70,3 75,8 70,13 65,8"   fill="url(#af-founder-green)" stroke="rgba(255,240,140,0.6)" strokeWidth="0.6" />
      <circle cx="70" cy="8" r="2.5" fill="url(#af-founder-ruby)" stroke="rgba(255,240,140,0.8)" strokeWidth="0.5" filter="url(#af-founder-softglow)" />
      <circle cx="70" cy="7.2" r="1" fill="rgba(255,255,255,0.55)" />
      {/* Top flanking diamonds */}
      <polygon points="38,8 42,4 46,8 42,12" fill="#0A0806" stroke="url(#af-founder-g)" strokeWidth="0.8" />
      <circle cx="42" cy="8" r="1.5" fill="url(#af-founder-emerald)" />
      <polygon points="94,8 98,4 102,8 98,12" fill="#0A0806" stroke="url(#af-founder-g)" strokeWidth="0.8" />
      <circle cx="98" cy="8" r="1.5" fill="url(#af-founder-emerald)" />

      {/* Bottom ornament */}
      <line x1="34" y1="132" x2="106" y2="132" stroke="url(#af-founder-g)" strokeWidth="1.2" opacity="0.8" />
      <path d="M 63,132 C 54,132 46,136 44,129 C 42,122 48,118 54,121 C 58,123 56,128 51,126"
            stroke="url(#af-founder-g)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="51" cy="126" r="2" fill="url(#af-founder-g)" opacity="0.8" />
      <path d="M 77,132 C 86,132 94,136 96,129 C 98,122 92,118 86,121 C 82,123 84,128 89,126"
            stroke="url(#af-founder-g)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="89" cy="126" r="2" fill="url(#af-founder-g)" opacity="0.8" />
      <polygon points="70,140 78,132 70,124 62,132"  fill="#0A0806" stroke="url(#af-founder-g)" strokeWidth="1.2" />
      <polygon points="70,137 75,132 70,127 65,132"  fill="url(#af-founder-green)" stroke="rgba(255,240,140,0.6)" strokeWidth="0.6" />
      <circle cx="70" cy="132" r="2.5" fill="url(#af-founder-ruby)" stroke="rgba(255,240,140,0.8)" strokeWidth="0.5" filter="url(#af-founder-softglow)" />
      <circle cx="70" cy="131.2" r="1" fill="rgba(255,255,255,0.55)" />
      <polygon points="38,132 42,128 46,132 42,136" fill="#0A0806" stroke="url(#af-founder-g)" strokeWidth="0.8" />
      <circle cx="42" cy="132" r="1.5" fill="url(#af-founder-emerald)" />
      <polygon points="94,132 98,128 102,132 98,136" fill="#0A0806" stroke="url(#af-founder-g)" strokeWidth="0.8" />
      <circle cx="98" cy="132" r="1.5" fill="url(#af-founder-emerald)" />

      {/* Side ornaments */}
      <polygon points="4,70 12,62 20,70 12,78"   fill="#0A0806" stroke="url(#af-founder-g)" strokeWidth="1" />
      <polygon points="4,70 10,64 16,70 10,76"   fill="url(#af-founder-green)" stroke="rgba(255,240,140,0.4)" strokeWidth="0.5" />
      <circle cx="10" cy="70" r="2" fill="url(#af-founder-ruby)" stroke="rgba(255,240,140,0.5)" strokeWidth="0.4" />
      <polygon points="136,70 128,62 120,70 128,78" fill="#0A0806" stroke="url(#af-founder-g)" strokeWidth="1" />
      <polygon points="136,70 130,64 124,70 130,76" fill="url(#af-founder-green)" stroke="rgba(255,240,140,0.4)" strokeWidth="0.5" />
      <circle cx="130" cy="70" r="2" fill="url(#af-founder-ruby)" stroke="rgba(255,240,140,0.5)" strokeWidth="0.4" />
    </>
  );
}

/* ------------------------------------------------------------------
   Main export
   ------------------------------------------------------------------ */

interface AvatarFrameProps {
  badge:    BadgeType;
  size:     number;       // avatar diameter in px
  children: React.ReactNode;
}

export function AvatarFrame({ badge, size, children }: AvatarFrameProps) {
  if (!badge) return <>{children}</>;

  const isFounder = badge === "founder";
  // 1.2× ratio aligns the avatar edge to the frame's inner ring at zero gap.
  // Derivation: inner ring radius ≈ r45 in 108px viewBox → 45*(outerSize/108) = size/2
  //             → outerSize = size * 108/90 = size * 1.2
  // Same 1.2× works for the 140px Founder viewBox (inner ring r59 → 59*(outerSize/140) ≈ size/2).
  const outerSize = Math.round(size * 1.2);

  return (
    <div style={{ position: "relative", width: outerSize, height: outerSize, flexShrink: 0 }}>
      <svg
        viewBox={isFounder ? "0 0 140 140" : "0 0 108 108"}
        fill="none"
        style={{
          position: "absolute",
          top:      0,
          left:     0,
          width:    "100%",
          height:   "100%",
          overflow: "visible",
        }}
        aria-hidden="true"
      >
        {badge === "beta_tester"     && <BetaTesterFrame />}
        {badge === "member"          && <MemberFrame />}
        {badge === "premium"         && <PremiumFrame />}
        {badge === "top_contributor" && <TopContributorFrame />}
        {badge === "moderator"       && <ModeratorFrame />}
        {badge === "partner"         && <PartnerFrame />}
        {badge === "founder"         && <FounderFrame />}
      </svg>

      {/* Avatar slot — centered, circular clip */}
      <div
        style={{
          position:     "absolute",
          top:          "50%",
          left:         "50%",
          transform:    "translate(-50%, -50%)",
          width:        size,
          height:       size,
          borderRadius: "50%",
          overflow:     "hidden",
          flexShrink:   0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
