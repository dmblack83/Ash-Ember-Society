import { cn } from "@/lib/utils";

type LogoVariant = "full" | "icon" | "text";
type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
}

/* ------------------------------------------------------------------
   Ember icon: a minimal cigar silhouette — diagonal shaft, glowing
   ember at the lit tip. The ember dot uses the ember-pulse animation
   defined in globals.css.
   ------------------------------------------------------------------ */

const iconDimensions = {
  sm: 22,
  md: 30,
  lg: 40,
} as const;

function EmberIcon({ size = "md" }: { size?: LogoSize }) {
  const dim = iconDimensions[size];

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Cigar body — diagonal line from lower-left to upper-right */}
      <line
        x1="4"
        y1="20"
        x2="19"
        y2="5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/*
       * Ember glow — larger, semi-transparent outer ring.
       * The separate inner dot + outer ring gives depth without blur,
       * since SVG filters aren't available in all CSS contexts.
       */}
      <circle
        cx="19"
        cy="5"
        r="3.5"
        fill="var(--ember)"
        opacity="0.25"
        style={{ animation: "ember-pulse 3s ease-in-out infinite" }}
      />
      {/* Ember core — solid, brighter */}
      <circle
        cx="19"
        cy="5"
        r="1.75"
        fill="var(--ember)"
        style={{ animation: "ember-pulse 3s ease-in-out infinite" }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------
   Typography sizing per variant
   ------------------------------------------------------------------ */

const textScale = {
  sm: {
    primary: "text-lg leading-none",
    sub: "text-[9px] tracking-[0.28em]",
    gap: "gap-0.5",
  },
  md: {
    primary: "text-2xl leading-none",
    sub: "text-[11px] tracking-[0.28em]",
    gap: "gap-1",
  },
  lg: {
    primary: "text-4xl leading-none",
    sub: "text-sm tracking-[0.28em]",
    gap: "gap-1.5",
  },
} as const;

/* ------------------------------------------------------------------
   Text-only portion — shared by 'text' and 'full' variants
   ------------------------------------------------------------------ */

function LogoText({ size = "md" }: { size?: LogoSize }) {
  const scale = textScale[size];

  return (
    <div className={cn("flex flex-col", scale.gap)}>
      {/*
       * "Ash & Ember" in Playfair Display.
       * The ampersand is highlighted in --accent gold — a subtle signal
       * that this is a brand mark, not just a heading.
       */}
      <span
        className={cn(
          "font-serif font-bold tracking-wide text-foreground",
          scale.primary
        )}
      >
        Ash{" "}
        <span className="text-accent" aria-hidden="true">
          &amp;
        </span>{" "}
        Ember
      </span>

      {/* "SOCIETY" — Inter uppercase, generously tracked, muted */}
      <span
        className={cn(
          "font-sans uppercase text-muted-foreground font-medium",
          scale.sub
        )}
      >
        Society
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Logo — exported component
   ------------------------------------------------------------------ */

export function Logo({ variant = "full", size = "md", className }: LogoProps) {
  if (variant === "icon") {
    return (
      <span className={cn("inline-flex text-foreground", className)}>
        <EmberIcon size={size} />
      </span>
    );
  }

  if (variant === "text") {
    return (
      <div className={cn("inline-flex", className)}>
        <LogoText size={size} />
      </div>
    );
  }

  /* full — icon left, text right */
  const iconGap = { sm: "gap-2", md: "gap-3", lg: "gap-4" }[size];

  return (
    <div
      className={cn("inline-flex items-center text-foreground", iconGap, className)}
    >
      <EmberIcon size={size} />
      <LogoText size={size} />
    </div>
  );
}
