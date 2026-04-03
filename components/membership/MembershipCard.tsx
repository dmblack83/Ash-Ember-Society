"use client";

import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { MembershipTier } from "@/lib/stripe";

/* ------------------------------------------------------------------
   Props
   ------------------------------------------------------------------ */

interface MembershipCardProps {
  userId:      string;
  displayName: string;
  tier:        MembershipTier;
  memberSince: string | null;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function formatMemberSince(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/* ------------------------------------------------------------------
   MembershipCard
   ------------------------------------------------------------------ */

export function MembershipCard({ userId, displayName, tier, memberSince }: MembershipCardProps) {
  const isPremium = tier === "premium";

  /* Encode membership data into QR code (no sensitive data) */
  const qrValue = useMemo(() => {
    return JSON.stringify({
      id:    userId,
      tier,
      since: memberSince?.split("T")[0] ?? null,
      app:   "ash-ember-society",
    });
  }, [userId, tier, memberSince]);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden select-none ${isPremium ? "card-premium glow-gold" : "glow-ember"}`}
      style={{
        background: isPremium
          ? "linear-gradient(135deg, #1A1210 0%, #241C17 40%, #1E160F 100%)"
          : "linear-gradient(135deg, #1A1210 0%, #241C17 60%, #1A1210 100%)",
        border: isPremium
          ? "1px solid rgba(212,160,74,0.4)"
          : "1px solid rgba(193,120,23,0.35)",
        aspectRatio: "1.586 / 1",          /* ISO 7810 ID-1 proportion */
        maxWidth: "400px",
      }}
      aria-label={`${isPremium ? "Premium" : "Member"} membership card for ${displayName}`}
    >
      {/* Background grain texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      {/* Ambient light sweep */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isPremium
            ? "radial-gradient(ellipse at 30% 20%, rgba(212,160,74,0.06) 0%, transparent 60%)"
            : "radial-gradient(ellipse at 30% 20%, rgba(193,120,23,0.07) 0%, transparent 60%)",
        }}
      />

      <div className="relative h-full flex flex-col justify-between p-5 sm:p-6">

        {/* Top row: brand + tier badge */}
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <p
              className="text-[10px] uppercase tracking-[0.2em] font-semibold"
              style={{ color: isPremium ? "rgba(212,160,74,0.7)" : "rgba(193,120,23,0.7)" }}
            >
              Ash & Ember Society
            </p>
            <p
              className="text-xs font-medium text-muted-foreground"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Est. 2024
            </p>
          </div>

          {/* Tier badge */}
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border"
            style={
              isPremium
                ? {
                    background: "linear-gradient(135deg, rgba(193,120,23,0.2), rgba(212,160,74,0.2))",
                    borderColor: "rgba(212,160,74,0.4)",
                    color: "var(--accent)",
                  }
                : {
                    backgroundColor: "rgba(193,120,23,0.12)",
                    borderColor: "rgba(193,120,23,0.3)",
                    color: "var(--primary)",
                  }
            }
          >
            {isPremium ? "Premium" : "Member"}
          </span>
        </div>

        {/* Bottom row: name + since + QR */}
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p
              className="text-xl sm:text-2xl font-bold text-foreground truncate"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {displayName}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Member since {formatMemberSince(memberSince)}
            </p>
            <p
              className="text-[9px] uppercase tracking-widest font-medium"
              style={{ color: isPremium ? "var(--accent)" : "var(--primary)", opacity: 0.7 }}
            >
              Present at partner shops for your discount
            </p>
          </div>

          {/* QR code */}
          <div
            className="flex-shrink-0 rounded-lg overflow-hidden p-1.5"
            style={{ backgroundColor: "rgba(245,230,211,0.95)" }}
          >
            <QRCodeSVG
              value={qrValue}
              size={56}
              bgColor="rgba(245,230,211,0)"
              fgColor="#1A1210"
              level="M"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
