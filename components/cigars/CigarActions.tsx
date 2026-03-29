"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { AddToHumidorSheet } from "./AddToHumidorSheet";

/* ------------------------------------------------------------------
   Toast — amber left border, auto-dismisses after 3s
   ------------------------------------------------------------------ */

function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-6 right-6 z-[60] card animate-slide-up flex items-center gap-3 max-w-xs"
      style={{ borderLeft: "4px solid var(--primary)" }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="flex-shrink-0"
        style={{ color: "var(--primary)" }}
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5 8L7 10L11 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-sm text-foreground">{message}</p>
    </div>
  );
}

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
