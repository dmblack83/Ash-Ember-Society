"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { createClient } from "@/utils/supabase/client";
import { Toast } from "@/components/ui/toast";
import { revalidateHumidor } from "@/lib/data/humidor-cache";
import { keyFor } from "@/lib/data/keys";
import { fetchCigarWishlisted } from "@/lib/data/cigar-fetchers";
import { useAppSession } from "@/components/system/app-session";

/* AddFlowSheet is always mounted (it manages its own visibility via the
   `open` prop), but lazy-loading still splits its chunk off the initial
   bundle and parallelizes the fetch. */
const AddFlowSheet = dynamic(
  () => import("./add-flow/AddFlowSheet").then((m) => ({ default: m.AddFlowSheet })),
  { ssr: false },
);

/* ------------------------------------------------------------------
   CigarActions — client wrapper for the Add to Humidor sheet and
   the Add to Wishlist toggle. Selection-aware: cigarId is whichever
   size the caller currently has selected, so the wishlist flag and
   both CTA labels track the picked vitola.
   ------------------------------------------------------------------ */

interface CigarActionsProps {
  cigarId:  string;   // the SELECTED size (child id)
  sizeText: string;   // e.g. 'Perfecto 50 × 4"' — CTA label suffix
}

export function CigarActions({ cigarId, sizeText }: CigarActionsProps) {
  const { ready, session } = useAppSession();
  const userId = ready && session ? session.userId : null;
  const { data: isWishlisted = false, mutate: mutateWishlisted } = useSWR(
    userId ? keyFor.cigarWishlisted(userId, cigarId) : null,
    () => fetchCigarWishlisted(userId as string, cigarId),
  );

  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function toggleWishlist() {
    if (wishlistLoading) return;

    /* Optimistic update through the SWR cache */
    const prev = isWishlisted;
    void mutateWishlisted(!prev, { revalidate: false });
    setWishlistLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      void mutateWishlisted(prev, { revalidate: false });
      setWishlistLoading(false);
      return;
    }

    if (!prev) {
      /* Add to wishlist */
      const { error } = await supabase.from("humidor_items").insert({
        user_id: user.id,
        cigar_id: cigarId,
        is_wishlist: true,
      });
      if (error) {
        void mutateWishlisted(prev, { revalidate: false });
        setToast("Failed to add to wishlist.");
      } else {
        setToast("Added to your wishlist!");
      }
    } else {
      /* Remove from wishlist */
      const { error } = await supabase
        .from("humidor_items")
        .delete()
        .eq("user_id", user.id)
        .eq("cigar_id", cigarId)
        .eq("is_wishlist", true);
      if (error) {
        void mutateWishlisted(prev, { revalidate: false });
        setToast("Failed to remove from wishlist.");
      }
    }

    /* Refresh the Humidor empty-state wishlist CTA (the hasWishlist count).
       Safe on the error paths too — a re-pull just returns current server
       truth. */
    void revalidateHumidor(user.id);
    void mutateWishlisted();
    setWishlistLoading(false);
  }

  function handleAddSuccess(message?: string) {
    /* AddFlowSheet's finishHumidorInsert doesn't revalidate the Humidor
       SWR cache itself (unlike the old AddToHumidorSheet.insertEntry) —
       do it here so the humidor list is fresh when the user navigates
       back to it. */
    if (userId) void revalidateHumidor(userId);
    setToast(message ?? "Added to your humidor!");
  }

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => setSheetOpen(true)}
        >
          Add to Humidor · {sizeText}
        </button>

        <button
          type="button"
          onClick={toggleWishlist}
          disabled={wishlistLoading}
          className={`btn w-full transition-all duration-150 ${
            isWishlisted ? "btn-ghost opacity-70" : "btn-secondary"
          }`}
        >
          {isWishlisted ? "On Wishlist ✓" : `Add to Wishlist · ${sizeText}`}
        </button>
      </div>

      <AddFlowSheet
        open={sheetOpen}
        entry={{ kind: "vitola", cigarId }}
        mode="humidor"
        onClose={() => setSheetOpen(false)}
        onAdded={handleAddSuccess}
      />
    </>
  );
}
