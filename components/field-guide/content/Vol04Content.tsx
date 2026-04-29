const S = {
  serif: "'Playfair Display', Georgia, serif",
  sans:  "Inter, system-ui, sans-serif",
  gold:  "var(--gold)",
  ember: "var(--ember)",
  fg1:   "var(--foreground)",
  fg2:   "var(--muted-foreground)",
  fg3:   "rgba(166,144,128,0.75)",
} as const;

function Pips({ on, total = 5 }: { on: number; total?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width:        8,
            height:       8,
            borderRadius: "50%",
            background:   i < on ? "var(--gold)" : "transparent",
            border:       "1px solid rgba(212,160,74,0.55)",
            boxShadow:    i < on ? "0 0 6px rgba(212,160,74,0.5)" : "none",
          }}
        />
      ))}
    </span>
  );
}

function SectionDivider({ label, num }: { label: string; num: string }) {
  return (
    <div
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        18,
        margin:     "0 0 28px",
      }}
    >
      <span
        style={{
          fontFamily:    S.sans,
          fontSize:      10.5,
          fontWeight:    600,
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color:         S.gold,
          whiteSpace:    "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex:       1,
          height:     1,
          background: "linear-gradient(90deg, rgba(212,160,74,0.4), rgba(212,160,74,0))",
          display:    "block",
        }}
      />
      <span
        style={{
          fontFamily: S.serif,
          fontStyle:  "italic",
          color:      S.fg3,
          fontSize:   13,
        }}
      >
        {num}
      </span>
    </div>
  );
}

export function Vol04Content() {
  return (
    <>
      {/* Intro with drop cap */}
      <p
        style={{
          margin:     "44px auto 56px",
          maxWidth:   680,
          textAlign:  "center",
          fontFamily: S.serif,
          fontStyle:  "italic",
          fontSize:   19,
          lineHeight: 1.6,
          color:      S.fg1,
        }}
      >
        <span
          style={{
            fontFamily: S.serif,
            fontSize:   "3.2em",
            float:      "left",
            lineHeight: 0.9,
            padding:    "6px 10px 0 0",
            color:      S.gold,
            fontStyle:  "normal",
            fontWeight: 700,
          }}
        >
          T
        </span>
        he cut is the first decision you make about a cigar, and the only one you cannot take back. Choose well, and the wrapper holds, the draw is even, and the leaf does the work. Choose poorly, and the rest of the hour is spent fighting the cigar instead of listening to it.
      </p>

      {/* ── Cut One: Straight ── */}
      <SectionDivider label="Cut One" num="i." />

      <div
        style={{
          background:   "linear-gradient(135deg, rgba(36,28,23,0.92) 0%, rgba(30,22,15,0.92) 100%)",
          border:       "1px solid rgba(166,144,128,0.18)",
          borderRadius: 12,
          padding:      "32px 28px",
          marginBottom: 36,
          position:     "relative",
          overflow:     "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position:      "absolute",
            top:           -120,
            right:         -120,
            width:         280,
            height:        280,
            background:    "radial-gradient(circle, rgba(212,160,74,0.10) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            fontFamily:    S.serif,
            fontStyle:     "italic",
            fontSize:      72,
            color:         "rgba(212,160,74,0.18)",
            lineHeight:    1,
            letterSpacing: "-0.04em",
            marginBottom:  8,
          }}
        >
          01
        </div>

        <div
          style={{
            display:        "flex",
            justifyContent: "center",
            gap:            32,
            alignItems:     "flex-end",
            marginBottom:   28,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/field-guide/maduro-cigar.png"
            alt="Maduro cigar"
            style={{
              height:  140,
              width:   "auto",
              display: "block",
              filter:  "drop-shadow(0 12px 20px rgba(0,0,0,0.55))",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/field-guide/guillotine-cutter.png"
              alt="Guillotine cutter"
              style={{
                width:     88,
                height:    88,
                objectFit: "contain",
                filter:    "drop-shadow(0 8px 14px rgba(0,0,0,0.6))",
              }}
            />
            <span
              style={{
                fontFamily:    S.sans,
                fontSize:      9.5,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color:         S.fg2,
              }}
            >
              Guillotine
            </span>
          </div>
        </div>

        <div
          style={{
            fontFamily:    S.sans,
            fontSize:      10,
            fontWeight:    600,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color:         S.ember,
            marginBottom:  10,
          }}
        >
          The Workhorse
        </div>
        <h2
          style={{
            fontFamily:    S.serif,
            fontSize:      34,
            fontWeight:    700,
            lineHeight:    1.05,
            letterSpacing: "-0.015em",
            margin:        "0 0 6px",
            color:         S.fg1,
          }}
        >
          The Straight Cut
        </h2>
        <div
          style={{
            fontFamily:   S.serif,
            fontStyle:    "italic",
            fontSize:     15,
            color:        S.fg2,
            marginBottom: 18,
          }}
        >
          also: guillotine, flat cut
        </div>
        <p
          style={{
            fontFamily:   S.serif,
            fontSize:     16.5,
            lineHeight:   1.6,
            color:        S.fg1,
            margin:       "0 0 24px",
          }}
        >
          A clean, level slice across the cap, taking off just enough leaf to expose the bunch beneath. The default of every lounge in the world for a reason: it is fast, neutral, and lets the cigar speak for itself.
        </p>

        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                 16,
            borderTop:           "1px solid rgba(166,144,128,0.18)",
            borderBottom:        "1px solid rgba(166,144,128,0.18)",
            padding:             "16px 0",
            marginBottom:        22,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Draw</span>
            <span style={{ fontFamily: S.serif, fontSize: 17, fontWeight: 600, color: S.gold, lineHeight: 1.2 }}>Open</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Difficulty</span>
            <Pips on={3} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Best On</span>
            <span style={{ fontFamily: S.serif, fontSize: 17, fontWeight: 600, color: S.fg1, lineHeight: 1.2 }}>Parejo</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <h4 style={{ margin: "0 0 10px", fontFamily: S.sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase" as const, color: S.gold }}>
              In Its Favor
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Most volume of smoke per draw", "Forgiving on nearly any ring gauge", "Cap stays neat, no torn wrapper", "Every cutter on earth makes one"].map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.5, color: S.fg1, paddingLeft: 16, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, color: S.gold, fontWeight: 700 }}>+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 style={{ margin: "0 0 10px", fontFamily: S.sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase" as const, color: S.ember }}>
              Against
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Cut too deep and the cap unravels", "Heat hits the tongue more directly", "Can over-draw thin ring gauges"].map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.5, color: S.fg1, paddingLeft: 16, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, color: S.ember, fontWeight: 700 }}>&minus;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Cut Two: Punch ── */}
      <SectionDivider label="Cut Two" num="ii." />

      <div
        style={{
          background:   "linear-gradient(135deg, rgba(36,28,23,0.92) 0%, rgba(30,22,15,0.92) 100%)",
          border:       "1px solid rgba(166,144,128,0.18)",
          borderRadius: 12,
          padding:      "32px 28px",
          marginBottom: 36,
          position:     "relative",
          overflow:     "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position:      "absolute",
            top:           -120,
            right:         -120,
            width:         280,
            height:        280,
            background:    "radial-gradient(circle, rgba(212,160,74,0.10) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            fontFamily:    S.serif,
            fontStyle:     "italic",
            fontSize:      72,
            color:         "rgba(212,160,74,0.18)",
            lineHeight:    1,
            letterSpacing: "-0.04em",
            marginBottom:  8,
          }}
        >
          02
        </div>

        <div
          style={{
            display:        "flex",
            justifyContent: "center",
            gap:            32,
            alignItems:     "flex-end",
            marginBottom:   28,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/field-guide/maduro-cigar.png"
            alt="Maduro cigar"
            style={{ height: 140, width: "auto", display: "block", filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.55))" }}
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/field-guide/punch-cutter.png"
              alt="Bullet punch cutter"
              style={{ width: 88, height: 88, objectFit: "contain", filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.6))" }}
            />
            <span style={{ fontFamily: S.sans, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg2 }}>
              Punch
            </span>
          </div>
        </div>

        <div style={{ fontFamily: S.sans, fontSize: 10, fontWeight: 600, letterSpacing: "0.32em", textTransform: "uppercase" as const, color: S.ember, marginBottom: 10 }}>
          The Quiet One
        </div>
        <h2 style={{ fontFamily: S.serif, fontSize: 34, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.015em", margin: "0 0 6px", color: S.fg1 }}>
          The Punch
        </h2>
        <div style={{ fontFamily: S.serif, fontStyle: "italic", fontSize: 15, color: S.fg2, marginBottom: 18 }}>
          also: bullet punch, bullseye
        </div>
        <p style={{ fontFamily: S.serif, fontSize: 16.5, lineHeight: 1.6, color: S.fg1, margin: "0 0 24px" }}>
          A small circular bore through the center of the cap, leaving the surrounding wrapper intact. The cap stays whole, the smoke draws through a tighter aperture, and the flavor concentrates instead of rushing the palate.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, borderTop: "1px solid rgba(166,144,128,0.18)", borderBottom: "1px solid rgba(166,144,128,0.18)", padding: "16px 0", marginBottom: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Draw</span>
            <span style={{ fontFamily: S.serif, fontSize: 17, fontWeight: 600, color: S.gold, lineHeight: 1.2 }}>Concentrated</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Difficulty</span>
            <Pips on={2} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Best On</span>
            <span style={{ fontFamily: S.serif, fontSize: 17, fontWeight: 600, color: S.fg1, lineHeight: 1.2 }}>50 ring &amp; up</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <h4 style={{ margin: "0 0 10px", fontFamily: S.sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase" as const, color: S.gold }}>
              In Its Favor
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Cap stays intact, no shedding leaf", "Pocket-sized cutter, travels well", "Cooler smoke, flavor concentrated", "Forgiving for the inexperienced"].map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.5, color: S.fg1, paddingLeft: 16, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, color: S.gold, fontWeight: 700 }}>+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 style={{ margin: "0 0 10px", fontFamily: S.sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase" as const, color: S.ember }}>
              Against
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Useless on small ring gauges", "Tar can collect at the bore", "Restricted draw on dense cigars"].map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.5, color: S.fg1, paddingLeft: 16, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, color: S.ember, fontWeight: 700 }}>&minus;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Cut Three: V-Cut ── */}
      <SectionDivider label="Cut Three" num="iii." />

      <div
        style={{
          background:   "linear-gradient(135deg, rgba(36,28,23,0.92) 0%, rgba(30,22,15,0.92) 100%)",
          border:       "1px solid rgba(166,144,128,0.18)",
          borderRadius: 12,
          padding:      "32px 28px",
          marginBottom: 36,
          position:     "relative",
          overflow:     "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position:      "absolute",
            top:           -120,
            right:         -120,
            width:         280,
            height:        280,
            background:    "radial-gradient(circle, rgba(212,160,74,0.10) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            fontFamily:    S.serif,
            fontStyle:     "italic",
            fontSize:      72,
            color:         "rgba(212,160,74,0.18)",
            lineHeight:    1,
            letterSpacing: "-0.04em",
            marginBottom:  8,
          }}
        >
          03
        </div>

        <div
          style={{
            display:        "flex",
            justifyContent: "center",
            gap:            32,
            alignItems:     "flex-end",
            marginBottom:   28,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/field-guide/maduro-cigar.png"
            alt="Maduro cigar"
            style={{ height: 140, width: "auto", display: "block", filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.55))" }}
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/field-guide/v-cutter.png"
              alt="V-cutter"
              style={{ width: 88, height: 88, objectFit: "contain", filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.6))" }}
            />
            <span style={{ fontFamily: S.sans, fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg2 }}>
              V-Cutter
            </span>
          </div>
        </div>

        <div style={{ fontFamily: S.sans, fontSize: 10, fontWeight: 600, letterSpacing: "0.32em", textTransform: "uppercase" as const, color: S.ember, marginBottom: 10 }}>
          The Connoisseur&apos;s Cut
        </div>
        <h2 style={{ fontFamily: S.serif, fontSize: 34, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.015em", margin: "0 0 6px", color: S.fg1 }}>
          The V-Cut
        </h2>
        <div style={{ fontFamily: S.serif, fontStyle: "italic", fontSize: 15, color: S.fg2, marginBottom: 18 }}>
          also: wedge cut, cat&apos;s eye
        </div>
        <p style={{ fontFamily: S.serif, fontSize: 16.5, lineHeight: 1.6, color: S.fg1, margin: "0 0 24px" }}>
          A precise V-shaped notch cut into the cap, opening more surface area than a punch but less than a guillotine. The smoke fans across the tongue rather than down the center, broadening the flavor without overwhelming the wrapper.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, borderTop: "1px solid rgba(166,144,128,0.18)", borderBottom: "1px solid rgba(166,144,128,0.18)", padding: "16px 0", marginBottom: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Draw</span>
            <span style={{ fontFamily: S.serif, fontSize: 17, fontWeight: 600, color: S.gold, lineHeight: 1.2 }}>Balanced</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Difficulty</span>
            <Pips on={1} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: S.fg3 }}>Best On</span>
            <span style={{ fontFamily: S.serif, fontSize: 17, fontWeight: 600, color: S.fg1, lineHeight: 1.2 }}>Round-headed</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <h4 style={{ margin: "0 0 10px", fontFamily: S.sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase" as const, color: S.gold }}>
              In Its Favor
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["Wide draw without losing the cap", "Spreads smoke across the palate", "Reads as deliberate, not borrowed", "Excellent on torpedo and belicoso"].map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.5, color: S.fg1, paddingLeft: 16, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, color: S.gold, fontWeight: 700 }}>+</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 style={{ margin: "0 0 10px", fontFamily: S.sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase" as const, color: S.ember }}>
              Against
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {["A dull blade tears the wrapper fast", "Tar pools in the trough of the V", "Not all V-cutters are made equally"].map((item) => (
                <li key={item} style={{ fontSize: 13.5, lineHeight: 1.5, color: S.fg1, paddingLeft: 16, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, color: S.ember, fontWeight: 700 }}>&minus;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Comparison table ── */}
      <SectionDivider label="At a Glance" num="iv." />

      <div
        style={{
          background:   "var(--card)",
          border:       "1px solid rgba(166,144,128,0.18)",
          borderRadius: 12,
          padding:      "32px 28px 36px",
          marginBottom: 48,
        }}
      >
        <h3
          style={{
            fontFamily: S.serif,
            fontSize:   24,
            fontWeight: 700,
            margin:     "0 0 6px",
            color:      S.fg1,
          }}
        >
          Choosing the cut
        </h3>
        <p
          style={{
            fontFamily: S.serif,
            fontStyle:  "italic",
            color:      S.fg2,
            margin:     "0 0 24px",
            fontSize:   15,
          }}
        >
          A side by side, for the moment before the lighter comes out.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 460 }}>
            <thead>
              <tr>
                {["Cut", "Aperture", "Draw", "Smoke", "Best for", "Risk"].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign:     "left",
                      padding:       "14px 12px",
                      borderBottom:  "1px solid rgba(166,144,128,0.14)",
                      fontFamily:    S.sans,
                      fontSize:      10,
                      fontWeight:    600,
                      letterSpacing: "0.28em",
                      textTransform: "uppercase" as const,
                      color:         i === 0 ? S.gold : S.fg3,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", fontFamily: S.serif, fontSize: 15.5, fontWeight: 600, color: S.fg1 }}>
                  Straight
                  <span style={{ display: "block", fontFamily: S.serif, fontStyle: "italic", fontSize: 12, color: S.fg3, fontWeight: 400, marginTop: 2 }}>guillotine</span>
                </td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Wide, full face</td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Open, generous</td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Voluminous, hot</td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Any parejo</td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Cap unraveling</td>
              </tr>
              <tr>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", fontFamily: S.serif, fontSize: 15.5, fontWeight: 600, color: S.fg1 }}>
                  Punch
                  <span style={{ display: "block", fontFamily: S.serif, fontStyle: "italic", fontSize: 12, color: S.fg3, fontWeight: 400, marginTop: 2 }}>bullet</span>
                </td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Narrow, circular</td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Tight, focused</td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Cool, concentrated</td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>50 ring &amp; larger</td>
                <td style={{ padding: "14px 12px", borderBottom: "1px solid rgba(166,144,128,0.14)", color: S.fg2 }}>Tar at the bore</td>
              </tr>
              <tr>
                <td style={{ padding: "14px 12px", fontFamily: S.serif, fontSize: 15.5, fontWeight: 600, color: S.fg1 }}>
                  V-Cut
                  <span style={{ display: "block", fontFamily: S.serif, fontStyle: "italic", fontSize: 12, color: S.fg3, fontWeight: 400, marginTop: 2 }}>wedge</span>
                </td>
                <td style={{ padding: "14px 12px", color: S.fg2 }}>Notched, fanned</td>
                <td style={{ padding: "14px 12px", color: S.fg2 }}>Balanced, even</td>
                <td style={{ padding: "14px 12px", color: S.fg2 }}>Spread wide on tongue</td>
                <td style={{ padding: "14px 12px", color: S.fg2 }}>Torpedo, belicoso</td>
                <td style={{ padding: "14px 12px", color: S.fg2 }}>Pooling in the trough</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Closing quote */}
      <p
        style={{
          textAlign:  "center",
          margin:     "8px auto 36px",
          maxWidth:   640,
          fontFamily: S.serif,
          fontStyle:  "italic",
          fontSize:   19,
          lineHeight: 1.55,
          color:      S.fg1,
          position:   "relative",
          padding:    "0 28px",
        }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: S.serif,
            fontSize:   56,
            lineHeight: 0,
            color:      S.gold,
            position:   "absolute",
            top:        18,
            left:       -4,
          }}
        >
          &#8220;
        </span>
        The cigar tells you which cut it wants. Listen to the cap, the ring, the way the head sits in your hand. Then choose, once, and never look back.
        <span
          aria-hidden
          style={{
            fontFamily: S.serif,
            fontSize:   56,
            lineHeight: 0,
            color:      S.gold,
            position:   "absolute",
            top:        18,
            right:      -4,
          }}
        >
          &#8221;
        </span>
      </p>
    </>
  );
}
