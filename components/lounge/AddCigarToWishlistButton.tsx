"use client";

import { useState }          from "react";
import { mutate as swrMutate } from "swr";
import { createClient }       from "@/utils/supabase/client";
import { tapHaptic }          from "@/lib/haptics";

/* ------------------------------------------------------------------
   AddCigarToWishlistButton

   Surfaced below the VerdictCard when viewing someone else's burn
   report in the lounge (inline modal AND /lounge/[postId] detail).
   Direct insert into humidor_items with is_wishlist=true; the
   unique-violation code (23505) is treated as a soft success (the
   user already had it on their wishlist).

   Cross-cache invalidation: after a successful add we mutate the
   viewer's wishlist SWR keys so /humidor/wishlist reflects the new
   entry on next visit instead of waiting for the dedupingInterval.
   ------------------------------------------------------------------ */

export function AddCigarToWishlistButton({
  cigarId,
  userId,
}: {
  cigarId: string;
  userId:  string;
}) {
  const [adding, setAdding] = useState(false);
  const [added,  setAdded]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function handleAdd() {
    if (adding || added) return;
    setAdding(true);
    setError(null);

    const supabase = createClient();
    const { error: insertErr } = await supabase
      .from("humidor_items")
      .insert({ user_id: userId, cigar_id: cigarId, quantity: 1, is_wishlist: true });

    setAdding(false);

    /* 23505 = unique violation — already on wishlist. Treat as
       success rather than an error. */
    if (!insertErr || insertErr.code === "23505") {
      setAdded(true);
      tapHaptic();
      swrMutate(["wishlist", userId]);
      swrMutate(["wishlist-has", userId]);
    } else {
      setError(insertErr.message);
    }
  }

  return (
    <div className="flex items-center justify-center mt-5" style={{ minHeight: 44 }}>
      <button
        type="button"
        onClick={handleAdd}
        disabled={adding || added}
        className="flex items-center gap-2 text-xs font-semibold"
        style={{
          border:                  "none",
          color:                   added ? "rgba(212,160,74,0.5)" : "var(--gold, #D4A04A)",
          background:              "none",
          cursor:                  added || adding ? "default" : "pointer",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
          padding:                 0,
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill={added ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        {added ? "In Wishlist" : adding ? "Adding..." : "Add to Wishlist"}
      </button>
      {error && (
        <span className="text-xs ml-3" style={{ color: "var(--destructive)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
