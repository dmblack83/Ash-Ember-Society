import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server-user";
import { ArticleShell, Em } from "@/components/field-guide/article-components";
import { Vol02Content } from "@/components/field-guide/content/Vol02Content";

export const runtime = "edge";

/* The article body is the shared Vol02Content component — the same
   one the Home field-guide modal renders — so copy and responsive
   fixes live in exactly one place. This page only owns the masthead
   props. */

export default async function Vol02Page() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <ArticleShell
      volNumber="Vol. 02"
      volLabel="Field Guide · Vol. 02 · The Leaf"
      eyebrow="Field Guide · Volume Two"
      kicker="The Tobaccos & Their Lands"
      title={<>The <Em>Leaf</Em></>}
      deck="A cigar is the leaf. Everything else is logistics. To understand the cigar at any real depth, the leaf has to come into focus."
      meta={
        <>
          <span>Ash &amp; Ember Society</span>
          <span style={{ color: "var(--gold)" }}>&bull;</span>
          <span>Read 11 min</span>
          <span style={{ color: "var(--gold)" }}>&bull;</span>
          <span>The Tobaccos &amp; Their Lands</span>
        </>
      }
    >
      <Vol02Content />
    </ArticleShell>
  );
}
