/* ------------------------------------------------------------------
   DashboardSection — shared scaffold for every Home dashboard panel.

   Props
   ─────
   title        Section heading rendered in Playfair Display / gold.
   children     Section content.
   className    Extra classes on the outer <section>.
   sectionIndex Staggered fade-in delay: each step adds 80 ms.
                Defaults to 0 (no extra delay).
   ------------------------------------------------------------------ */

export function DashboardSection({
  title,
  children,
  className = "",
  sectionIndex = 0,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  sectionIndex?: number;
}) {
  return (
    <section
      className={`flex flex-col gap-3 animate-fade-in ${className}`}
      style={{ animationDelay: `${sectionIndex * 80}ms` }}
    >
      <h2
        className="text-sm font-semibold leading-none"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          color: "var(--gold)",
          letterSpacing: "0.01em",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------
   DashboardSkeleton — pulsing glass placeholder used while a section
   is waiting for its data. Drop it as the sole child of a
   DashboardSection while content is loading.
   ------------------------------------------------------------------ */

export function DashboardSkeleton({ height = 120 }: { height?: number }) {
  return (
    <div
      className="glass animate-pulse w-full rounded-xl"
      style={{ height }}
      aria-hidden="true"
    />
  );
}
