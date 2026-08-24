"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { CurrentCigar } from "./SuggestCigarEditSheet";
import { loadCigarDraft } from "@/lib/cigars/cigar-draft";

/* SuggestCigarEditSheet is a non-trivial form. Lazy-load so it only
   ships when the user taps the button. */
const SuggestCigarEditSheet = dynamic(
  () => import("./SuggestCigarEditSheet").then((m) => ({ default: m.SuggestCigarEditSheet })),
  { ssr: false },
);

interface Props {
  cigar:       CurrentCigar;
  hasPending:  boolean;
}

export function CigarEditSuggestButton({ cigar, hasPending }: Props) {
  const [open, setOpen] = useState(false);

  /* A live draft for this cigar means the page reloaded out from under
     an in-progress edit (iOS PWA eviction after Look up / app switch).
     Reopen the sheet; it restores the draft fields itself. */
  useEffect(() => {
    if (loadCigarDraft("suggest-edit", cigar.id)) setOpen(true);
  }, [cigar.id]);

  if (hasPending) {
    return (
      <p className="text-center text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
        Edit suggestion pending review
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-xs font-medium py-2 rounded-lg mt-3"
        style={{
          background:  "transparent",
          border:      "1px solid var(--border)",
          color:       "var(--muted-foreground)",
          cursor:      "pointer",
          touchAction: "manipulation",
        }}
      >
        Suggest an Edit
      </button>

      {open && (
        <SuggestCigarEditSheet
          cigar={cigar}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
