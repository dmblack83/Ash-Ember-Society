import {
  DashboardSection,
  DashboardSkeleton,
} from "@/components/dashboard/dashboard-section";
import { WelcomeSection } from "@/components/dashboard/WelcomeSection";

export default function HomePage() {
  return (
    <div className="px-4 sm:px-6 py-6 flex flex-col gap-6 max-w-2xl mx-auto">

      {/* ── 0. Personalised welcome ───────────────────────────────── */}
      <WelcomeSection />

      {/* ── 1. Quick-glance humidor snapshot ──────────────────────── */}
      <DashboardSection title="My Humidor" sectionIndex={1}>
        <DashboardSkeleton height={120} />
      </DashboardSection>

      {/* ── 2. Recent smoke / burn report ─────────────────────────── */}
      <DashboardSection title="Recent Smokes" sectionIndex={2}>
        <DashboardSkeleton height={96} />
      </DashboardSection>

      {/* ── 3. Trending in the catalog ────────────────────────────── */}
      <DashboardSection title="Trending Cigars" sectionIndex={3}>
        <DashboardSkeleton height={160} />
      </DashboardSection>

      {/* ── 4. Community / lounge activity ───────────────────────── */}
      <DashboardSection title="Lounge Activity" sectionIndex={4}>
        <DashboardSkeleton height={120} />
      </DashboardSection>

      {/* ── 5. Membership / account status ───────────────────────── */}
      <DashboardSection title="Membership" sectionIndex={5}>
        <DashboardSkeleton height={80} />
      </DashboardSection>

    </div>
  );
}
