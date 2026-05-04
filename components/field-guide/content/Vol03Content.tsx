import Image from "next/image";
import {
  Em,
  SectionHeading,
  SectionRule,
  PullQuote,
  Closer,
} from "@/components/field-guide/article-components";

const S = {
  serif: "'Playfair Display', Georgia, serif",
  sans:  "Inter, system-ui, sans-serif",
  gold:  "var(--gold)",
  ember: "var(--ember)",
  fg1:   "var(--foreground)",
  fg2:   "var(--muted-foreground)",
  fg3:   "rgba(166,144,128,0.75)",
} as const;

export function Vol03Content() {
  return (
    <>
      {/* Drop cap paragraph */}
      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        <span
          style={{
            fontFamily: S.serif,
            fontSize:   "4.4em",
            float:      "left",
            lineHeight: 0.85,
            padding:    "8px 12px 0 0",
            color:      S.gold,
            fontWeight: 700,
          }}
        >
          A
        </span>
        cigar is not just a cigar. The same blend of leaf, rolled into a different shape and size, produces a fundamentally different smoking experience. The cigar world has a name for the specific combination of shape and dimensions that defines an individual stick: <em style={{ color: S.gold, fontStyle: "italic" }}>vitola</em>. A Spanish word that translates roughly to &ldquo;size and shape,&rdquo; and the most useful piece of vocabulary anyone serious about cigars can learn.
      </p>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Two cigars from the same brand, with the same blend, in two different vitolas, will not smoke the same. The proportions matter. The geometry matters. The ratio of wrapper to filler matters. A Romeo y Julieta Churchill and a Romeo y Julieta Robusto are made from the same tobacco and rolled in the same factory by the same hands, and they are different smokes.
      </p>

      <PullQuote>
        Understanding the vitola is the difference between buying a brand and buying a cigar.
      </PullQuote>

      <SectionHeading>How a Cigar <Em>Is Measured</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Cigars are measured two ways: <em style={{ color: S.gold, fontStyle: "italic" }}>length</em> and <em style={{ color: S.gold, fontStyle: "italic" }}>ring gauge</em>. Length is straightforward, in inches. Ring gauge is the diameter, expressed in 64ths of an inch. A 50 ring gauge cigar, the most common size on the market today, is 50/64 of an inch thick, just under three quarters of an inch wide. A 64 ring is a full inch in diameter. A 32 ring is half an inch.
      </p>

      {/* Measurement primer */}
      <div style={{ margin: "32px 0", padding: "26px 28px", background: "var(--card)", borderLeft: "2px solid var(--gold)", borderRadius: 2 }}>
        <div style={{ fontFamily: S.sans, fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: S.ember, marginBottom: 12 }}>
          A Quick Primer
        </div>
        <h3 style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 22, margin: "0 0 14px", lineHeight: 1.2, color: S.fg1 }}>
          Length &times; <em style={{ fontStyle: "italic", color: S.gold, fontWeight: 400 }}>Ring Gauge</em>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 28px", marginTop: 20 }}>
          <div style={{ borderTop: "1px solid rgba(212,160,74,0.2)", paddingTop: 14 }}>
            <div style={{ fontFamily: S.serif, fontStyle: "italic", color: S.gold, fontSize: 17, marginBottom: 4 }}>Length</div>
            <div style={{ fontFamily: S.sans, fontSize: 13.5, color: S.fg2, lineHeight: 1.55 }}>Foot to cap, in inches. The smoking time. A Robusto runs 5&Prime;; a Churchill, 7&Prime;.</div>
          </div>
          <div style={{ borderTop: "1px solid rgba(212,160,74,0.2)", paddingTop: 14 }}>
            <div style={{ fontFamily: S.serif, fontStyle: "italic", color: S.gold, fontSize: 17, marginBottom: 4 }}>Ring Gauge</div>
            <div style={{ fontFamily: S.sans, fontSize: 13.5, color: S.fg2, lineHeight: 1.55 }}>Diameter in 64ths of an inch. Bigger numbers = thicker cigar. The wrapper-to-filler ratio.</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 20, paddingTop: 14, borderTop: "1px solid rgba(212,160,74,0.2)" }}>
          {[
            { rg: "32",  what: "Pencil-thin"   },
            { rg: "42",  what: "Classic Corona" },
            { rg: "50",  what: "Modern Default" },
            { rg: "60+", what: "The Gordo Era"  },
          ].map((t) => (
            <div key={t.rg} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: S.serif, fontStyle: "italic", fontSize: 22, color: S.gold, lineHeight: 1 }}>{t.rg}</div>
              <div style={{ fontFamily: S.sans, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: S.fg3, marginTop: 6 }}>{t.what}</div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Length and ring gauge together describe the geometry. A 5 by 50 is short and stout. A 7 by 38 is long and slender. The same blend in those two sizes produces two different cigars, and the difference is not subtle. Larger ring gauges burn cooler and let the filler dominate. Smaller ring gauges burn warmer and put the wrapper in the spotlight. Longer cigars develop and evolve. Shorter cigars concentrate the experience.
      </p>

      <SectionRule />

      <SectionHeading>The <Em>Sizes</Em> Worth Knowing</SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        The cigar world has dozens of named sizes, and every major brand layers its own internal naming on top of that. The five below come up constantly, the working vocabulary of any serious lounge.
      </p>

      {/* Sizes plate */}
      <div style={{ margin: "36px 0 8px", background: "var(--card)", border: "1px solid rgba(212,160,74,0.22)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, padding: "28px 24px 8px" }}>
          <span style={{ flex: "1 1 auto", height: 1, background: "linear-gradient(90deg, transparent, var(--gold) 12%, var(--gold) 88%, transparent)", display: "block" }} />
          <h3 style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 26, letterSpacing: "0.18em", textTransform: "uppercase", color: S.fg1, margin: 0 }}>Sizes</h3>
          <span style={{ flex: "1 1 auto", height: 1, background: "linear-gradient(90deg, transparent, var(--gold) 12%, var(--gold) 88%, transparent)", display: "block" }} />
        </div>
        <div style={{ padding: "18px 12px 28px", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 8 }}>
          {[
            { id: "corona",    label: "Corona",    dim: "5.5\u20136\u2033 \u00d7 42\u201344", h: 170, top: "5.5\u2033", bot: "6\u2033"   },
            { id: "robusto",   label: "Robusto",   dim: "5\u20135.5\u2033 \u00d7 50",         h: 154, top: "5\u2033",   bot: "5.5\u2033" },
            { id: "toro",      label: "Toro",      dim: "6\u20136.5\u2033 \u00d7 50",         h: 178, top: "6\u2033",   bot: "6.5\u2033" },
            { id: "churchill", label: "Churchill", dim: "7\u20137.5\u2033 \u00d7 47\u201350", h: 202, top: "7\u2033",   bot: "7.5\u2033" },
            { id: "gordo",     label: "Gordo",     dim: "6\u20136.5\u2033 \u00d7 60+",        h: 190, top: "6\u2033",   bot: "6.5\u2033" },
          ].map((s) => (
            <div key={s.id} style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", color: S.ember, fontFamily: S.serif, fontStyle: "italic", fontSize: 9, lineHeight: 1, padding: "2px 0", height: s.h }}>
                  <span>{s.top}</span>
                  <div style={{ flex: 1, width: 1, background: S.ember, margin: "4px 0", minHeight: 16 }} />
                  <span>{s.bot}</span>
                </div>
                <Image
                  src={`/field-guide/cigar-${s.id}.webp`}
                  alt={`${s.label} cigar`}
                  width={48}
                  height={s.h}
                  sizes="48px"
                  quality={80}
                  style={{ height: s.h, width: "auto", display: "block" }}
                />
              </div>
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <div style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: S.fg1 }}>{s.label}</div>
                <div style={{ fontFamily: S.serif, fontStyle: "italic", fontSize: 10, color: S.gold, marginTop: 2 }}>{s.dim}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sizes table */}
      <table style={{ width: "100%", borderCollapse: "collapse", margin: "28px 0 8px", fontFamily: S.sans, fontSize: 14 }}>
        <thead>
          <tr>
            {["Size", "Dimensions", "Character"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "12px 14px", borderBottom: "1px solid var(--gold)", fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: S.gold, fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontWeight: 600, fontSize: 16, verticalAlign: "top", color: S.fg1 }}>Corona<span style={{ display: "block", fontFamily: S.serif, fontStyle: "italic", fontWeight: 400, color: S.gold, fontSize: 12, marginTop: 3 }}>the classic</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontStyle: "italic", fontSize: 14, color: S.gold, verticalAlign: "top", whiteSpace: "nowrap" }}>5.5&ndash;6&Prime; &times; 42&ndash;44<span style={{ display: "block", color: S.fg3, fontFamily: S.sans, fontStyle: "normal", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>~45 min</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", color: S.fg2, fontSize: 13.5, lineHeight: 1.55, verticalAlign: "top" }}>The original benchmark, against which everything else used to be measured. Slower burn, more elegant, restrained. A connoisseur&apos;s reminder of what cigars were before the obsession with girth.</td>
          </tr>
          <tr>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontWeight: 600, fontSize: 16, verticalAlign: "top", color: S.fg1 }}>Robusto<span style={{ display: "block", fontFamily: S.serif, fontStyle: "italic", fontWeight: 400, color: S.gold, fontSize: 12, marginTop: 3 }}>short &amp; stout</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontStyle: "italic", fontSize: 14, color: S.gold, verticalAlign: "top", whiteSpace: "nowrap" }}>5&ndash;5.5&Prime; &times; 50<span style={{ display: "block", color: S.fg3, fontFamily: S.sans, fontStyle: "normal", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>~45&ndash;60 min</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", color: S.fg2, fontSize: 13.5, lineHeight: 1.55, verticalAlign: "top" }}>Quick to light, intense in flavor, the most popular size in modern American cigar culture. What to reach for when there is time for a real cigar but not time for a long one.</td>
          </tr>
          <tr>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontWeight: 600, fontSize: 16, verticalAlign: "top", color: S.fg1 }}>Toro<span style={{ display: "block", fontFamily: S.serif, fontStyle: "italic", fontWeight: 400, color: S.gold, fontSize: 12, marginTop: 3 }}>the workhorse</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontStyle: "italic", fontSize: 14, color: S.gold, verticalAlign: "top", whiteSpace: "nowrap" }}>6&ndash;6.5&Prime; &times; 50<span style={{ display: "block", color: S.fg3, fontFamily: S.sans, fontStyle: "normal", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>~60&ndash;90 min</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", color: S.fg2, fontSize: 13.5, lineHeight: 1.55, verticalAlign: "top" }}>The current king of the American market. A bit more length than a Robusto, same diameter, adds time without changing the basic flavor character. The default house cigar.</td>
          </tr>
          <tr>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontWeight: 600, fontSize: 16, verticalAlign: "top", color: S.fg1 }}>Churchill<span style={{ display: "block", fontFamily: S.serif, fontStyle: "italic", fontWeight: 400, color: S.gold, fontSize: 12, marginTop: 3 }}>long &amp; slender</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontStyle: "italic", fontSize: 14, color: S.gold, verticalAlign: "top", whiteSpace: "nowrap" }}>7&ndash;7.5&Prime; &times; 47&ndash;50<span style={{ display: "block", color: S.fg3, fontFamily: S.sans, fontStyle: "normal", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>~90&ndash;120 min</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", color: S.fg2, fontSize: 13.5, lineHeight: 1.55, verticalAlign: "top" }}>Named after Winston, who smoked the Romeo y Julieta version every day for half a century. A cigar to plan an evening around.</td>
          </tr>
          <tr>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontWeight: 600, fontSize: 16, verticalAlign: "top", color: S.fg1 }}>Gordo<span style={{ display: "block", fontFamily: S.serif, fontStyle: "italic", fontWeight: 400, color: S.gold, fontSize: 12, marginTop: 3 }}>the modern fat</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", fontFamily: S.serif, fontStyle: "italic", fontSize: 14, color: S.gold, verticalAlign: "top", whiteSpace: "nowrap" }}>6&ndash;6.5&Prime; &times; 60+<span style={{ display: "block", color: S.fg3, fontFamily: S.sans, fontStyle: "normal", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>~90+ min</span></td>
            <td style={{ padding: "16px 14px", borderBottom: "1px solid rgba(212,160,74,0.14)", color: S.fg2, fontSize: 13.5, lineHeight: 1.55, verticalAlign: "top" }}>The modern fat-cigar phenomenon. Traditionalists hate them, a 60-ring quiets the wrapper and changes the balance. A great Gordo is still a great cigar. Personal preference territory.</td>
          </tr>
        </tbody>
      </table>

      {/* Lancero callout */}
      <div style={{ margin: "32px 0", padding: "28px 30px", background: "var(--card)", border: "1px solid rgba(212,160,74,0.3)", borderRadius: 6, position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 64, height: 1, background: S.ember }} />
        <div style={{ fontFamily: S.sans, fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: S.ember, marginBottom: 8 }}>Worth Seeking Out</div>
        <h3 style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 26, margin: "0 0 4px", color: S.fg1 }}>The <em style={{ fontStyle: "italic", color: S.gold, fontWeight: 400 }}>Lancero</em></h3>
        <div style={{ fontFamily: S.serif, fontStyle: "italic", color: S.gold, fontSize: 14, marginBottom: 14 }}>7&ndash;7.5&Prime; &times; 38&ndash;40 ring gauge</div>
        <p style={{ fontSize: 15, color: S.fg1, lineHeight: 1.65, margin: 0 }}>
          A long, thin, elegant cigar with a near-mythic place in Cuban history. The Lancero is what Fidel Castro smoked, after he tasted a stick rolled by Eduardo Ribera, the personal roller of one of his bodyguards, and demanded that the man be given a factory of his own. That factory became <em style={{ color: S.gold, fontStyle: "italic" }}>El Laguito</em>. The cigar became the original Cohiba. The narrow ring amplifies the wrapper until the flavor becomes almost concentrated, the most challenging vitola in the cigar world to roll well, and the most rewarding to smoke when it is rolled right.
        </p>
      </div>

      {/* Honorable mentions */}
      <div style={{ margin: "32px 0", padding: "22px 26px", borderTop: "1px solid rgba(212,160,74,0.2)", borderBottom: "1px solid rgba(212,160,74,0.2)" }}>
        <div style={{ fontFamily: S.sans, fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: S.fg2, marginBottom: 16, textAlign: "center" }}>Also In The Family</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
          {[
            { name: "Lonsdale",      dim: "6\u20136.75\u2033 \u00d7 42\u201344", desc: "A longer, slimmer corona. Classic in the Cuban tradition; missed by anyone who knows what they are missing." },
            { name: "Petit Corona",  dim: "4.5\u20135\u2033 \u00d7 40\u201342",   desc: "The little brother. A thirty-minute smoke when there is time for quality but not for length." },
            { name: "Double Corona", dim: "7.5\u20138\u2033 \u00d7 49\u201352",   desc: "The grand format. Full-bodied, two hours. The Hoyo de Monterrey is legendary." },
          ].map((item, i) => (
            <div key={item.name} style={{ textAlign: "center", padding: "0 14px", borderRight: i < 2 ? "1px solid rgba(212,160,74,0.14)" : "none" }}>
              <div style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 16, marginBottom: 4, color: S.fg1 }}>{item.name}</div>
              <div style={{ fontFamily: S.serif, fontStyle: "italic", color: S.gold, fontSize: 12, marginBottom: 6 }}>{item.dim}</div>
              <div style={{ fontFamily: S.sans, fontSize: 12.5, color: S.fg3, lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <SectionRule />

      <SectionHeading>Shape: <Em>Parejo</Em> &amp; <Em>Figurado</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Every cigar in the world falls into one of two shape families. <em style={{ color: S.gold, fontStyle: "italic" }}>Parejo</em> means &ldquo;even&rdquo; or &ldquo;straight&rdquo;, uniform diameter from foot to cap, rounded head. The classic shape, the one that fills almost every humidor on almost every shelf, the one that comes to mind when somebody says the word cigar. Straightforward to roll, straightforward to smoke, consistent draw and burn from start to finish.
      </p>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        <em style={{ color: S.gold, fontStyle: "italic" }}>Figurado</em> means &ldquo;shaped,&rdquo; and the figurado category covers everything that is not a straight-sided cylinder. The geometry actually changes while the cigar burns, the ratio of wrapper to filler shifts dramatically from foot to middle to cap.
      </p>

      {/* Shapes plate */}
      <div style={{ margin: "36px 0 8px", background: "var(--card)", border: "1px solid rgba(212,160,74,0.22)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, padding: "28px 24px 8px" }}>
          <span style={{ flex: "1 1 auto", height: 1, background: "linear-gradient(90deg, transparent, var(--gold) 12%, var(--gold) 88%, transparent)", display: "block" }} />
          <h3 style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 26, letterSpacing: "0.18em", textTransform: "uppercase", color: S.fg1, margin: 0 }}>Shapes</h3>
          <span style={{ flex: "1 1 auto", height: 1, background: "linear-gradient(90deg, transparent, var(--gold) 12%, var(--gold) 88%, transparent)", display: "block" }} />
        </div>
        <div style={{ padding: "18px 18px 56px", display: "grid", gridTemplateColumns: "1fr 1px 2fr", gap: 24, alignItems: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color: S.fg1, marginBottom: 4 }}>Parejo</div>
            <div style={{ fontFamily: S.serif, fontStyle: "italic", color: S.gold, fontSize: 13, marginBottom: 22 }}>Straight</div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Image
                  src="/field-guide/cigar-parejo.webp"
                  alt="Parejo cigar"
                  width={48}
                  height={240}
                  sizes="48px"
                  quality={80}
                  style={{ height: 240, width: "auto", display: "block" }}
                />
                <div style={{ marginTop: 12, fontFamily: S.serif, fontWeight: 600, fontSize: 14, letterSpacing: "0.16em", textTransform: "uppercase", color: S.fg1 }}>Parejo</div>
                <div style={{ fontFamily: S.serif, fontStyle: "italic", fontSize: 11.5, color: S.gold, marginTop: 2 }}>uniform gauge</div>
              </div>
            </div>
          </div>
          <div style={{ width: 1, background: "linear-gradient(180deg, transparent, rgba(212,160,74,0.4) 20%, rgba(212,160,74,0.4) 80%, transparent)", alignSelf: "stretch" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color: S.fg1, marginBottom: 4 }}>Figurado</div>
            <div style={{ fontFamily: S.serif, fontStyle: "italic", color: S.gold, fontSize: 13, marginBottom: 22 }}>Tapered</div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 28, width: "100%" }}>
              {[
                { id: "torpedo",  name: "Torpedo",  gloss: "pointed cap"       },
                { id: "perfecto", name: "Perfecto", gloss: "tapered both ends" },
              ].map((s) => (
                <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <Image
                    src={`/field-guide/cigar-${s.id}.webp`}
                    alt={`${s.name} cigar`}
                    width={48}
                    height={240}
                    sizes="48px"
                    quality={80}
                    style={{ height: 240, width: "auto", display: "block" }}
                  />
                  <div style={{ marginTop: 12, fontFamily: S.serif, fontWeight: 600, fontSize: 14, letterSpacing: "0.16em", textTransform: "uppercase", color: S.fg1 }}>{s.name}</div>
                  <div style={{ fontFamily: S.serif, fontStyle: "italic", fontSize: 11.5, color: S.gold, marginTop: 2 }}>{s.gloss}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>The figurados worth knowing by name:</p>

      {/* Shape list */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, margin: "28px 0 12px", borderTop: "1px solid rgba(212,160,74,0.2)" }}>
        {[
          { name: "Torpedo", gloss: "Straight body, pointed cap", desc: "The pointed cap concentrates smoke into a narrower stream as it crosses the palate, which sharpens the flavor. Also a roller\u2019s flex, harder to make well. A great torpedo is one of the most pleasurable cigars on earth." },
          { name: "Pyramid", gloss: "A true tapered cone", desc: "Tapered from foot to cap. Starts with a wide-open foot for an easy light and a rich initial draw, then narrows toward the cap, so flavor concentration shifts as the cigar burns down." },
          { name: "Perfecto", gloss: "Tapered at both ends", desc: "The oldest cigar shape, the one the Ta\u00ed\u00f1o were rolling before any Spaniard stepped on a beach. A well-made perfecto changes character three times before it ends, essentially three cigars in one." },
          { name: "Belicoso", gloss: "Short, stout, tapered cap", desc: "Smaller than a torpedo, more compact, often a slightly thicker ring gauge. Punchy. The figurado for when there is no time for ceremony." },
          { name: "Diadema", gloss: "A statement piece", desc: "Very long, sometimes ten inches or more, tapered at one or both ends. Not for a Tuesday." },
          { name: "Culebra", gloss: "Three braided panatelas", desc: "Three thin panatelas braided together, untwisted and smoked one at a time. Once a way to give factory workers a daily ration that could not easily be smuggled. Now a curiosity, mostly bought as a conversation piece." },
        ].map((item, i) => (
          <div key={item.name} style={{ padding: i % 2 === 0 ? "22px 24px 22px 0" : "22px 0 22px 24px", borderBottom: "1px solid rgba(212,160,74,0.14)", borderLeft: i % 2 === 1 ? "1px solid rgba(212,160,74,0.14)" : "none" }}>
            <div style={{ fontFamily: S.serif, fontWeight: 600, fontSize: 19, color: S.fg1, letterSpacing: "-0.005em", marginBottom: 4 }}>{item.name}</div>
            <div style={{ fontFamily: S.serif, fontStyle: "italic", fontSize: 13, color: S.gold, marginBottom: 8 }}>{item.gloss}</div>
            <p style={{ fontFamily: S.sans, fontSize: 14, color: S.fg2, lineHeight: 1.55, margin: 0 }}>{item.desc}</p>
          </div>
        ))}
      </div>

      <SectionRule />

      <SectionHeading>Galera <Em>vs.</Em> Salida</SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        A piece of inside vocabulary worth knowing. <em style={{ color: S.gold, fontStyle: "italic" }}>Vitola de galera</em> is the factory name for a particular size and shape, the one the rollers use at the bench. <em style={{ color: S.gold, fontStyle: "italic" }}>Vitola de salida</em> is the brand name for the same vitola when it ships in a box.
      </p>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        The Cohiba Robusto and the Partagas Serie D No. 4 are the same vitola de galera, both 4.9 by 50, rolled to the same specifications by Cuban hands in the same factory tradition, even though they smoke completely differently because the blends are different. Once that idea lands, a lot of the cigar world starts to come into focus. The rollers think in geometry. The marketers think in branding. The smoker who knows the difference is ahead of the room.
      </p>

      <SectionRule />

      <SectionHeading>Why It <Em>Matters</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Geometry is flavor. A smoker who has only ever smoked one shape and one size of any given brand has only ever met part of that brand. The honest advice is to pick a brand worth knowing and smoke it in three or four different vitolas. The Robusto. The Toro. The Corona. The Lancero if it exists. The cigar will reveal itself differently each time, and the leaf-and-soil work from Volume II will start to make a different kind of sense, because the same leaf in different proportions tells a different story.
      </p>

      <PullQuote>
        The vitola is not a detail. The vitola is the cigar.
      </PullQuote>

      <Closer />
    </>
  );
}
