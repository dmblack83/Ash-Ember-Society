import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  variant?: "full" | "icon" | "text";
  size?: LogoSize;
  className?: string;
}

const heights: Record<LogoSize, number> = {
  sm: 44,
  md: 64,
  lg: 96,
};

/* ------------------------------------------------------------------
   Text-only fallback (used when variant="text")
   ------------------------------------------------------------------ */

const textScale = {
  sm: { primary: "text-lg leading-none",  sub: "text-[9px] tracking-[0.28em]",  gap: "gap-0.5" },
  md: { primary: "text-2xl leading-none", sub: "text-[11px] tracking-[0.28em]", gap: "gap-1"   },
  lg: { primary: "text-4xl leading-none", sub: "text-sm tracking-[0.28em]",     gap: "gap-1.5" },
} as const;

function LogoText({ size = "md" }: { size?: LogoSize }) {
  const scale = textScale[size];
  return (
    <div className={cn("flex flex-col", scale.gap)}>
      <span className={cn("font-serif font-bold tracking-wide text-foreground", scale.primary)}>
        Ash <span className="text-accent" aria-hidden="true">&amp;</span> Ember
      </span>
      <span className={cn("font-sans uppercase text-muted-foreground font-medium", scale.sub)}>
        Society
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Logo image — rendered for "full" and "icon" variants
   ------------------------------------------------------------------ */

export function Logo({ variant = "full", size = "md", className }: LogoProps) {
  if (variant === "text") {
    return (
      <div className={cn("inline-flex", className)}>
        <LogoText size={size} />
      </div>
    );
  }

  const h = heights[size];

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Image
        src="/logo.png"
        alt="Ash & Ember Society"
        height={h}
        width={h * 1.45}
        style={{ height: h, width: "auto" }}
        priority
      />
    </div>
  );
}
