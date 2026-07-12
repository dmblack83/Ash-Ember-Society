import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server-user";
import { ArticleShell, Em } from "@/components/field-guide/article-components";
import { Vol01Content } from "@/components/field-guide/content/Vol01Content";

export const runtime = "edge";

/* The article body is the shared Vol01Content component — the same
   one the Home field-guide modal renders — so copy and responsive
   fixes live in exactly one place. This page only owns the masthead
   props. */

export default async function Vol01Page() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <ArticleShell
      volNumber="Vol. 01"
      volLabel="Field Guide · Vol. 01 · A Brief History"
      eyebrow="Field Guide · Volume One"
      kicker="The Origin"
      title={<>A Brief <Em>History</Em><br />of the Cigar</>}
      deck="Five centuries of agriculture, weather, geography, and patient human hands - wound up tight, ready to hand back about an hour of life on better terms than it found things."
      meta={
        <>
          <span>Ash &amp; Ember Society</span>
          <span style={{ color: "var(--gold)" }}>&bull;</span>
          <span>Read 8 min</span>
          <span style={{ color: "var(--gold)" }}>&bull;</span>
          <span>1492 - Today</span>
        </>
      }
    >
      <Vol01Content />
    </ArticleShell>
  );
}
