"use client";

import { buildInviteSmsHref } from "@/lib/invite";

// Stable for the life of the module — the message has no dynamic parts.
const SMS_HREF = buildInviteSmsHref();

/* Account-tab section that lets a member fire off a prefilled invite text.
   SMS only for now; the Email CTA lands with its backend in a later PR. */
export function InviteFriendsSection() {
  return (
    <div>
      <p
        style={{
          fontSize:      11,
          fontWeight:    600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color:         "var(--muted-foreground)",
          padding:       "0 4px",
          marginBottom:  8,
        }}
      >
        Invite Friends
      </p>

      <div
        style={{
          borderRadius:    20,
          backgroundColor: "var(--card)",
          border:          "1px solid var(--border)",
          overflow:        "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--muted-foreground)", margin: 0 }}>
            Know someone who would appreciate a good smoke? Send them an invite.
          </p>

          <a
            href={SMS_HREF}
            className="flex items-center justify-center gap-2 transition-opacity active:opacity-70"
            style={{
              padding:                 "12px 0",
              borderRadius:            14,
              border:                  "1.5px solid var(--gold, #D4A04A)",
              color:                   "var(--gold, #D4A04A)",
              background:              "transparent",
              fontSize:                14,
              fontWeight:              600,
              textDecoration:          "none",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}
            aria-label="Invite a friend by text message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Text a friend
          </a>
        </div>
      </div>
    </div>
  );
}
