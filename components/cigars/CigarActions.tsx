"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import { Toast } from "@/components/ui/toast";

/* AddToHumidorSheet (462 lines) is always mounted (it manages its own
   visibility via the `open` prop), but lazy-loading still splits its
   ~30 KB chunk off the initial bundle and parallelizes the fetch. */
const AddToHumidorSheet = dynamic(
  () => import("./AddToHumidorSheet").then((m) => ({ default: m.AddToHumidorSheet })),
  { ssr: false },
);

/* ------------------------------------------------------------------
   CigarActions — client wrapper for the Add to Humidor sheet and
   the Add to Wishlist toggle. Placed as a server-passthrough component
   on the detail page so the page stays a server component.
   ------------------------------------------------------------------ */

interface CigarActionsProps {
  cigarId: string;
  initialIsWishlisted: boolean;
}

export function CigarActions({
  cigarId,
  initialIsWishlisted,
}: CigarActionsProps) {
  const [isWishlisted, setIsWishlisted] = useState(initialIsWishlisted);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function toggleWishlist() {
    if (wishlistLoading) return;

    /* Optimistic update */
    const prev = isWishlisted;
    setIsWishlisted(!prev);
    setWishlistLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsWishlisted(prev);
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
        setIsWishlisted(prev);
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
        setIsWishlisted(prev);
        setToast("Failed to remove from wishlist.");
      }
    }

    setWishlistLoading(false);
  }

  function handleAddSuccess() {
    setToast("Added to your humidor!");
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
          Add to Humidor
        </button>

        <button
          type="button"
          onClick={toggleWishlist}
          disabled={wishlistLoading}
          className={`btn w-full transition-all duration-150 ${
            isWishlisted ? "btn-ghost opacity-70" : "btn-secondary"
          }`}
        >
          {isWishlisted ? "On Wishlist ✓" : "Add to Wishlist"}
        </button>
      </div>

      <AddToHumidorSheet
        cigarId={cigarId}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}
