import {
  DashboardSection,
  DashboardSkeleton,
} from "@/components/dashboard/dashboard-section";
import { WelcomeSection, QuickActions } from "@/components/dashboard/WelcomeSection";
import { SmokingConditions } from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }       from "@/components/dashboard/AgingAlerts";
import { CigarNews }         from "@/components/dashboard/CigarNews";
import { TrendingLounge }    from "@/components/dashboard/TrendingLounge";

export default function HomePage() {
  return (
    <div className="px-4 sm:px-6 pt-4 pb-6 flex flex-col gap-6 max-w-2xl mx-auto">

      {/* ── 0. Fixed header (greeting + tier pill) ───────────────── */}
      <WelcomeSection />

      {/* ── 0b. Quick actions row ─────────────────────────────────── */}
      <QuickActions />

      {/* ── 1. Smoking conditions (weather) ───────────────────────── */}
      <SmokingConditions />

      {/* ── 2. Aging alerts ───────────────────────────────────────── */}
      <AgingAlerts />

      {/* ── 3. Quick-glance humidor snapshot ──────────────────────── */}
      <DashboardSection title="My Humidor" sectionIndex={3}>
        <DashboardSkeleton height={120} />
      </DashboardSection>

      {/* ── 4. Cigar news & editorial feed ────────────────────────── */}
      <CigarNews />

      {/* ── 5. Trending in The Lounge ─────────────────────────────── */}
      <TrendingLounge />

      {/* ── 6. Recent smoke / burn report ─────────────────────────── */}
      <DashboardSection title="Recent Smokes" sectionIndex={6}>
        <DashboardSkeleton height={96} />
      </DashboardSection>

      {/* ── 7. Trending in the catalog ────────────────────────────── */}
      <DashboardSection title="Trending Cigars" sectionIndex={7}>
        <DashboardSkeleton height={160} />
      </DashboardSection>

      {/* ── 8. Community / lounge activity ───────────────────────── */}
      <DashboardSection title="Lounge Activity" sectionIndex={8}>
        <DashboardSkeleton height={120} />
      </DashboardSection>

      {/* ── 9. Membership / account status ───────────────────────── */}
      <DashboardSection title="Membership" sectionIndex={9}>
        <DashboardSkeleton height={80} />
      </DashboardSection>

    </div>
  );
}
