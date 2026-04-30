"use client";

import { useState } from "react";
import { SubmitCigarPhotoSheet } from "./SubmitCigarPhotoSheet";

interface Props {
  cigarId:    string;
  cigarName:  string;
  hasPending: boolean;
}

export function CigarPhotoSubmitButton({ cigarId, cigarName, hasPending }: Props) {
  const [open, setOpen] = useState(false);

  if (hasPending) {
    return (
      <p className="text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
        Photo submission pending review
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-xs font-medium py-2 rounded-lg"
        style={{
          background:  "transparent",
          border:      "1px solid var(--border)",
          color:       "var(--muted-foreground)",
          cursor:      "pointer",
          touchAction: "manipulation",
        }}
      >
        Submit a photo
      </button>

      {open && (
        <SubmitCigarPhotoSheet
          cigarId={cigarId}
          cigarName={cigarName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
