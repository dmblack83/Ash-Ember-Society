import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server-user";
import { ArticleShell, Em } from "@/components/field-guide/article-components";
import { Vol03Content } from "@/components/field-guide/content/Vol03Content";

export const runtime = "edge";

/* The article body is the shared Vol03Content component — the same
   one the Home field-guide modal renders — so copy and responsive
   fixes live in exactly one place. This page only owns the masthead
   props. */

export default async function Vol03Page() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <ArticleShell
      volNumber="Vol. 03"
      volLabel="Field Guide · Vol. 03 · Shapes, Sizes & the Vitolas"
      eyebrow="Field Guide · Volume Three"
      kicker="The Vitola"
      title={<>Shapes, Sizes <Em>&amp;</Em><br />the <Em>Vitolas</Em></>}
      deck="Geometry is flavor. The same blend in three different vitolas produces three different cigars, and the smoker who knows the difference is ahead of the room."
      meta={
        <>
          <span>Ash &amp; Ember Society</span>
          <span style={{ color: "var(--gold)" }}>&bull;</span>
          <span>Read 9 min</span>
          <span style={{ color: "var(--gold)" }}>&bull;</span>
          <span>The Vitola</span>
        </>
      }
    >
      <Vol03Content />
    </ArticleShell>
  );
}
