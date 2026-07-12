import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server-user";
import { ArticleShell, Em } from "@/components/field-guide/article-components";
import { Vol04Content } from "@/components/field-guide/content/Vol04Content";

export const runtime = "edge";

/* The article body is the shared Vol04Content component — the same
   one the Home field-guide modal renders — so copy and responsive
   fixes live in exactly one place. This page only owns the masthead
   props. */

export default async function Vol04Page() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <ArticleShell
      volNumber="Vol. 04"
      volLabel="Field Guide · Vol. 04 · The Three Cuts"
      eyebrow="Field Guide · Volume Four"
      kicker="The Cut"
      title={<>The Three <Em>Cuts</Em></>}
      deck="A study of the only three openings worth making at the head of a fine cigar, and what each one does to the smoke that follows."
      meta={
        <>
          <span>Ash &amp; Ember Society</span>
          <span style={{ color: "var(--ember)" }}>&bull;</span>
          <span>Field Guide</span>
          <span style={{ color: "var(--ember)" }}>&bull;</span>
          <span>Read 4 min</span>
        </>
      }
      mastheadStyle="bordered"
    >
      <Vol04Content />
    </ArticleShell>
  );
}
