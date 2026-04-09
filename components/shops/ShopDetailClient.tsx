"use client";

import { useState } from "react";
import { MembershipCard } from "@/components/membership/MembershipCard";
import type { MembershipTier } from "@/lib/stripe";

interface ShowMembershipCardButtonProps {
  userId:      string;
  displayName: string;
  tier:        MembershipTier;
  memberSince: string | null;
}

export function ShowMembershipCardButton({
  userId,
  displayName,
  tier,
  memberSince,
}: ShowMembershipCardButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-secondary w-full">
        Show Membership Card
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70" style={{ backdropFilter: "blur(4px)" }} />
          <div
            className="relative w-full max-w-sm animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <MembershipCard
              userId={userId}
              displayName={displayName}
              tier={tier}
              memberSince={memberSince}
            />
            <button
              onClick={() => setOpen(false)}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
