/* ------------------------------------------------------------------
   Vendors page

   Placeholder shell for the affiliate-vendor directory. Curated
   list of online cigar retailers / accessories vendors with
   member-attributed referral links. Content will land in a
   follow-up; this file exists so the route resolves and the
   sub-tab links work.
   ------------------------------------------------------------------ */

export const metadata = {
  title: "Vendors — Ash & Ember Society",
};

export default function VendorsPage() {
  return (
    <div className="px-4 sm:px-6 pt-6 pb-6 max-w-2xl mx-auto">
      <div
        style={{
          padding:        "24px 20px",
          background:     "var(--card-bg)",
          border:         "1px solid var(--card-border)",
          borderRadius:   6,
          boxShadow:      "var(--card-edge)",
        }}
      >
        <div
          style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      10,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color:         "var(--paper-mute)",
            display:       "flex",
            alignItems:    "center",
            gap:           10,
            marginBottom:  14,
          }}
        >
          <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--gold)" }} />
          Vendors
        </div>
        <h1
          style={{
            fontFamily:   "var(--font-serif)",
            fontStyle:    "italic",
            fontSize:     22,
            lineHeight:   1.2,
            color:        "var(--foreground)",
            margin:       0,
            marginBottom: 8,
          }}
        >
          Coming soon
        </h1>
        <p
          style={{
            fontSize:   13,
            lineHeight: 1.55,
            color:      "var(--paper-mute)",
            margin:     0,
          }}
        >
          A curated list of online cigar retailers, accessory shops,
          and member-attributed referral partners is in the works.
        </p>
      </div>
    </div>
  );
}
