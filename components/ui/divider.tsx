import { cn } from "@/lib/utils";

interface DividerProps {
  className?: string;
}

/*
 * Decorative section divider — a thin ruled line with a small gold
 * diamond ornament centered on it. Gives the editorial lounge-menu
 * feel between major page sections.
 *
 * Usage:
 *   <Divider />
 *   <Divider className="my-12" />
 */
export function Divider({ className }: DividerProps) {
  return (
    <div
      role="separator"
      aria-hidden="true"
      className={cn("relative flex items-center", className)}
    >
      {/* Left rule */}
      <div className="flex-1 h-px bg-border" />

      {/* Gold diamond ornament */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mx-3 shrink-0"
        aria-hidden="true"
      >
        {/*
         * A rotated square (diamond). The fill uses --accent (gold) so it
         * inherits theme changes and stays consistent with premium elements.
         */}
        <rect
          x="1.5"
          y="1.5"
          width="7"
          height="7"
          rx="0.5"
          transform="rotate(45 5 5)"
          fill="var(--accent)"
          opacity="0.75"
        />
      </svg>

      {/* Right rule */}
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
