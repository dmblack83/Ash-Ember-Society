// Server-compatible wrapper — no "use client".
// Accepts server-fetched posts as props and renders immediately.
// All interactive logic (PostSheet, LikeButton, CommentThread) lives in CigarNewsClient.

import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { CigarNewsClient }  from "@/components/dashboard/CigarNewsClient";

/* ------------------------------------------------------------------
   Shared type — exported so home/page.tsx can import it for the
   server-side blog_posts query return type.
   ------------------------------------------------------------------ */

export interface BlogPost {
  id:              string;
  type:            string | null;   // "blog" | "news_link" | null
  title:           string;
  cover_image_url: string | null;
  excerpt:         string | null;
  body:            string | null;
  synopsis:        string | null;
  source_name:     string | null;
  source_url:      string | null;
  published_at:    string;
}

/* ------------------------------------------------------------------
   CigarNews

   Server component. Receives pre-fetched data from home/page.tsx,
   wraps the section header via DashboardSection, and delegates
   all rendering and interaction to CigarNewsClient.
   ------------------------------------------------------------------ */

interface CigarNewsProps {
  initialPosts:   BlogPost[];
  membershipTier: string;
  userId:         string | null;
  userName:       string;
}

export function CigarNews({
  initialPosts,
  membershipTier,
  userId,
  userName,
}: CigarNewsProps) {
  return (
    <DashboardSection title="Cigar News" sectionIndex={4}>
      <CigarNewsClient
        initialPosts={initialPosts}
        membershipTier={membershipTier}
        userId={userId}
        userName={userName}
      />
    </DashboardSection>
  );
}
