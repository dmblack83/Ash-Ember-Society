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

      {/* ── 3. Cigar news & editorial feed ────────────────────────── */}
      <CigarNews />

      {/* ── 4. Trending in The Lounge ─────────────────────────────── */}
      <TrendingLounge />

    </div>
  );
}
