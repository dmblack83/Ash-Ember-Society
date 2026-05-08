import { readFileSync } from "fs";
import { join } from "path";
import Link from "next/link";

/* ------------------------------------------------------------------
   Public legal-document page shell.

   Used by /privacy and /terms — both render markdown from
   `content/legal/*.md` on the server and serve them without auth.
   These URLs need to be reachable for Google's OAuth consent screen
   review and for footer links.

   Markdown rendering is intentionally minimal: the placeholder
   files only use #, ##, and paragraphs. If we move to a real legal
   document with lists / links / inline formatting, swap in
   react-markdown rather than expanding this matcher.
   ------------------------------------------------------------------ */

interface Props {
  title:    string;
  filename: string;
}

export function LegalDocument({ title, filename }: Props) {
  let content: string;
  try {
    content = readFileSync(
      join(process.cwd(), "content/legal", filename),
      "utf-8",
    );
  } catch {
    content = `# ${title}\n\nContent coming soon.`;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="px-5 py-4 border-b"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--card)",
        }}
      >
        <Link
          href="/"
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors duration-150"
        >
          ← Back to Ash &amp; Ember Society
        </Link>
      </header>

      <main className="flex-1 px-5 py-10">
        <article className="mx-auto max-w-2xl">
          <MarkdownBlock content={content} />
        </article>
      </main>
    </div>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="text-lg font-semibold text-foreground mt-8"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h1
              key={i}
              className="text-2xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {trimmed.slice(2)}
            </h1>
          );
        }
        return (
          <p
            key={i}
            className="text-sm text-muted-foreground leading-relaxed"
          >
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
