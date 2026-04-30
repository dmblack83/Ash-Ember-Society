import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server-user";
import {
  ArticleShell,
  Em,
  SectionHeading,
  SectionRule,
  PullQuote,
  Closer,
} from "@/components/field-guide/article-components";

export const dynamic = "force-dynamic";

const S = {
  serif: "'Playfair Display', Georgia, serif",
  sans:  "Inter, system-ui, sans-serif",
  gold:  "var(--gold)",
  ember: "var(--ember)",
  fg1:   "var(--foreground)",
  fg2:   "var(--muted-foreground)",
  fg3:   "rgba(166,144,128,0.75)",
} as const;

const PRIMINGS = [
  {
    name:  "Medio Tiempo",
    where: "the crown",
    desc:  <>A tiny harvest from the very top of the plant, rare enough that some growers go years without enough to roll a single batch. Cohiba <em style={{ color: "var(--gold)", fontStyle: "italic" }}>Behike</em> is built around it. That is why it costs what it costs.</>,
  },
  {
    name:  "Ligero",
    where: "top leaves",
    desc:  "Oily and intense, full sun all season. The hardest leaf to keep lit and the one that does the most for strength. The engine of any blend.",
  },
  {
    name:  "Viso",
    where: "upper middle",
    desc:  "More flavor than the seco below it. The flavor leaf, used in the filler to give the blend its character.",
  },
  {
    name:  "Seco",
    where: "lower middle",
    desc:  "Balanced and dry. The blender's tool for restraint, used to keep stronger leaves from running away with the cigar.",
  },
  {
    name:  "Volado",
    where: "bottom leaves",
    desc:  "Mild and easy-burning. The combustion leaf, used to keep the blend lit and the burn even.",
  },
] as const;

const LANDS = [
  {
    name:   "Cuba",
    region: "Pinar del Río",
    desc:   <>The legend, still. The <em style={{ color: "var(--gold)", fontStyle: "italic" }}>Vuelta Abajo</em> region in the far west of the island is the most famous tobacco-growing land on the planet, and the dirt there genuinely is different. Red, mineral-rich, perfectly drained. Vuelta Abajo grows the wrapper leaf for almost every famous Cuban brand. The flavor is a thing apart: earth, hay, cream, a particular sweet-spice note nobody has ever quite duplicated.</>,
  },
  {
    name:   "Dominican Republic",
    region: "Cibao Valley",
    desc:   <>A century of world-class cigar tobacco. The signature leaves are <em style={{ color: "var(--gold)", fontStyle: "italic" }}>piloto cubano</em>, a Cuban-seed cultivar adapted to Dominican soil, and <em style={{ color: "var(--gold)", fontStyle: "italic" }}>olor dominicano</em>, a native varietal with a softer, rounder character. Smooth and balanced rather than aggressive, the natural choice for smokers who want craft without the punch. The Fuente operation in Santiago is one of the great cigar houses on earth.</>,
  },
  {
    name:   "Nicaragua",
    region: "Estelí, Jalapa, Condega, Ometepe",
    desc:   <>The new heavyweight. Estel&iacute;, with rich volcanic soil, produces strong, full-bodied leaf. Jalapa, further north, comes out sweeter and more elegant. Condega splits the difference. There is also a tiny island called <em style={{ color: "var(--gold)", fontStyle: "italic" }}>Ometepe</em>, two volcanoes rising out of Lake Nicaragua, where small parcels grow some of the most distinctive tobacco in the world: smooth, mineral, faintly sweet, hard to describe and impossible to forget. The Nicaraguan revolution is not a marketing story. It is a soil story.</>,
  },
  {
    name:   "Honduras",
    region: "Jamastran Valley",
    desc:   "The Jamastran Valley near the Nicaraguan border grows a robust, earthy, slightly sweet leaf that has anchored some of the great cigars of the last forty years. Copán, near the Mayan ruins, also grows tobacco worth taking seriously. Honduran cigars tend toward heft and warmth, with notes of cedar, leather, and dark cocoa. Camacho built much of its reputation on this soil.",
  },
  {
    name:   "Ecuador",
    region: "Andean valleys",
    desc:   "Permanent cloud cover. The country sits on the equator, and the high-altitude valleys are blanketed in thin gray cloud almost year-round, which means the tobacco grows under natural shade without any cheesecloth required. Ecuadorian wrapper leaf is some of the most prized in the cigar world: silky, mild, beautiful to look at. The seed comes from somewhere else. The magic is the sky.",
  },
  {
    name:   "Connecticut",
    region: "Connecticut River Valley",
    desc:   <><em style={{ color: "var(--gold)", fontStyle: "italic" }}>Connecticut Shade</em> is the pale, mild, slightly grassy wrapper most associated with classic American cigars. <em style={{ color: "var(--gold)", fontStyle: "italic" }}>Connecticut Broadleaf</em>, sun-grown and rougher, is the foundation of most great maduro wrappers made in this hemisphere. The valley is smaller than it used to be, but the leaf is still legendary.</>,
  },
  {
    name:   "Mexico",
    region: "San Andrés, Veracruz",
    desc:   "San Andrés grows the dark, sweet, chocolatey wrapper leaf that has become the gold standard for maduro cigars. Black volcanic soil, long fermentation, a flavor that runs toward dark cocoa, espresso, and dried fruit. A serious San Andrés maduro is one of the great pleasures of the form.",
  },
  {
    name:   "Cameroon",
    region: "West Africa",
    desc:   "Once one of the most important wrapper sources on the planet, now a smaller and more specialized product. The flavor is unmistakable: a delicate, almost neutral sweetness with a toothy texture and a faintly nutty character. Arturo Fuente kept the Cameroon tradition alive when most of the industry walked away from it. The Hemingway line is one of the great loves of the modern cigar world.",
  },
  {
    name:   "Brazil",
    region: "Bahia",
    desc:   <><em style={{ color: "var(--gold)", fontStyle: "italic" }}>Mata Fina</em>, a dark, sweet, smoky leaf used for filler and binder, and <em style={{ color: "var(--gold)", fontStyle: "italic" }}>Mata Norte</em>, slightly different in character. Brazilian leaf shows up in blends from every serious country and brings a distinctive coffee-and-dark-fruit note that nothing else quite replicates.</>,
  },
  {
    name:   "Indonesia",
    region: "Sumatra, Java",
    desc:   "Sumatra and Java still produce serious tobacco, mostly used for wrapper and binder. Sumatran leaf has a long history in Dutch and German cigars and is enjoying a quiet revival in the New World market.",
  },
] as const;

const COLORS = [
  { cls: "#88944a", name: "Candela",        alt: "double claro"   },
  { cls: "#c9a26a", name: "Claro",          alt: "pale tan"       },
  { cls: "#a06b3a", name: "Colorado Claro", alt: "light reddish"  },
  { cls: "#7a4a26", name: "Colorado",       alt: "reddish brown"  },
  { cls: "#6b3a1f", name: "Natural",        alt: "medium brown"   },
  { cls: "#3d1f10", name: "Maduro",         alt: "dark, oily, sweet" },
  { cls: "#1c0d06", name: "Oscuro",         alt: "double maduro"  },
] as const;

export default async function Vol02Page() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <ArticleShell
      volNumber="Vol. 02"
      volLabel="Field Guide · Vol. 02 · The Leaf"
      eyebrow="Field Guide · Volume Two"
      kicker="The Tobaccos & Their Lands"
      title={<>The <Em>Leaf</Em></>}
      deck="A cigar is the leaf. Everything else is logistics. To understand the cigar at any real depth, the leaf has to come into focus."
      meta={
        <>
          <span>Ash &amp; Ember Society</span>
          <span style={{ color: S.gold }}>&bull;</span>
          <span>Read 11 min</span>
          <span style={{ color: S.gold }}>&bull;</span>
          <span>The Tobaccos &amp; Their Lands</span>
        </>
      }
    >
      {/* First paragraph with drop cap */}
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
        cigar is the leaf. Everything else is logistics. The wrapper that catches the eye, the binder that holds the bunch together, the filler that does the actual heavy lifting of flavor and strength: every fragrant stick on every shelf in the world is a particular conversation between five or six leaves grown in particular places by particular people who knew exactly when to pick them. To understand the cigar at any real depth, the leaf has to come into focus.
      </p>

      <SectionHeading>The <Em>Plant</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        The plant is <em style={{ color: S.gold, fontStyle: "italic" }}>Nicotiana tabacum</em>, a member of the nightshade family that grows tall and broad in the right soil, putting out big floppy leaves that look more like elephant ears than anything a serious agricultural product has any business being. A mature tobacco plant stands four to six feet tall and carries somewhere around twenty leaves arranged up the stalk in distinct positions, and the position determines almost everything. The lower leaves see the least sun and live in the shade of everything above. The upper leaves catch full sun for the entire growing season. By harvest time, leaves from the same plant taste like they came from different countries.
      </p>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Growers harvest the leaves position by position over a stretch of weeks rather than all at once, a process called <em style={{ color: S.gold, fontStyle: "italic" }}>priming</em>. The bottom leaves come off first, then the middle, then the top. Each priming has a name.
      </p>

      {/* The Primings diagram card */}
      <div
        style={{
          margin:       "36px 0 8px",
          background:   "var(--card)",
          border:       "1px solid rgba(212,160,74,0.22)",
          borderRadius: 6,
          overflow:     "hidden",
        }}
      >
        {/* Plate title */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            gap:            18,
            padding:        "28px 24px 20px",
          }}
        >
          <span
            style={{
              flex:       "1 1 auto",
              height:     1,
              background: "linear-gradient(90deg, transparent, var(--gold) 12%, var(--gold) 88%, transparent)",
              display:    "block",
            }}
          />
          <h3
            style={{
              fontFamily:    S.serif,
              fontWeight:    600,
              fontSize:      26,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color:         S.fg1,
              margin:        0,
            }}
          >
            The Primings
          </h3>
          <span
            style={{
              flex:       "1 1 auto",
              height:     1,
              background: "linear-gradient(90deg, transparent, var(--gold) 12%, var(--gold) 88%, transparent)",
              display:    "block",
            }}
          />
        </div>

        {/* Plant image - centered */}
        <div
          style={{
            display:        "flex",
            justifyContent: "center",
            padding:        "0 24px 24px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/field-guide/tobacco-plant.png"
            alt="A tobacco plant showing the four priming positions"
            style={{
              maxWidth:   360,
              width:      "100%",
              height:     "auto",
              display:    "block",
            }}
          />
        </div>
      </div>

      {/* Priming table */}
      <table
        style={{
          width:          "100%",
          borderCollapse: "collapse",
          margin:         "24px 0 8px",
          fontFamily:     S.sans,
          borderTop:      "1px solid rgba(212,160,74,0.22)",
          borderBottom:   "1px solid rgba(212,160,74,0.22)",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign:     "left",
                padding:       "14px 18px",
                fontSize:      10.5,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color:         "var(--muted-foreground)",
                fontWeight:    500,
                borderBottom:  "1px solid rgba(212,160,74,0.22)",
              }}
            >
              Priming
            </th>
            <th
              style={{
                textAlign:     "left",
                padding:       "14px 18px",
                fontSize:      10.5,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color:         "var(--muted-foreground)",
                fontWeight:    500,
                borderBottom:  "1px solid rgba(212,160,74,0.22)",
              }}
            >
              Character &amp; role in the blend
            </th>
          </tr>
        </thead>
        <tbody>
          {PRIMINGS.map((p, i) => (
            <tr key={p.name}>
              <td
                style={{
                  padding:       "14px 18px",
                  verticalAlign: "top",
                  borderBottom:  i < PRIMINGS.length - 1 ? "1px solid rgba(212,160,74,0.14)" : "none",
                  fontFamily:    S.serif,
                  fontWeight:    600,
                  fontSize:      16,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color:         S.fg1,
                  width:         "22%",
                  whiteSpace:    "nowrap",
                }}
              >
                {p.name}
                <span
                  style={{
                    display:       "block",
                    fontFamily:    S.serif,
                    fontStyle:     "italic",
                    fontWeight:    400,
                    fontSize:      12,
                    letterSpacing: 0,
                    textTransform: "none",
                    color:         S.gold,
                    marginTop:     3,
                  }}
                >
                  {p.where}
                </span>
              </td>
              <td
                style={{
                  padding:       "14px 18px",
                  verticalAlign: "top",
                  borderBottom:  i < PRIMINGS.length - 1 ? "1px solid rgba(212,160,74,0.14)" : "none",
                  fontSize:      14,
                  lineHeight:    1.6,
                  color:         "var(--muted-foreground)",
                }}
              >
                {p.desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionRule />

      <SectionHeading>Wrapper, <Em>Binder, Filler</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        A cigar has three jobs to do and uses three different leaves to do them.
      </p>

      {/* Three-job section */}
      <div
        style={{
          margin:       "32px 0 8px",
          borderTop:    "1px solid rgba(212,160,74,0.22)",
          borderBottom: "1px solid rgba(212,160,74,0.22)",
        }}
      >
        {[
          {
            num:   "i.",
            name:  "Wrapper",
            gloss: "the leaf you see",
            desc:  "The outer leaf, the one a smoker actually sees and judges. Twenty to sixty percent of the flavor depending on the blend, and it has to be flawless: no veins that telegraph through, no tears, no holes, no discolored patches. Wrapper leaf is the most expensive leaf on earth by weight, because the plants are babied, the harvesting is delicate, and most of what comes off the field gets rejected.",
          },
          {
            num:   "ii.",
            name:  "Binder",
            gloss: "the workhorse",
            desc:  "Wrapped immediately around the filler. Nobody looks at the binder. It does not have to be pretty. It has to hold the bunch together and burn evenly, and it quietly adds body and flavor to the blend even though it gets no credit.",
          },
          {
            num:   "iii.",
            name:  "Filler",
            gloss: "the heart",
            desc:  "Three or four leaves of different types, layered together long-leaf so the cigar draws right, blended for strength and complexity. A skilled blender uses ligero for power, viso for flavor, seco for balance, volado to keep the whole thing burning. The blender's job is to make the cigar taste like one thing instead of four.",
          },
        ].map((role, i) => (
          <div
            key={role.name}
            style={{
              display:             "grid",
              gridTemplateColumns: "minmax(180px, 1fr) 2.4fr",
              gap:                 28,
              padding:             "26px 4px",
              borderBottom:        i < 2 ? "1px solid rgba(212,160,74,0.18)" : "none",
              alignItems:          "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  fontFamily: S.serif,
                  fontStyle:  "italic",
                  color:      S.gold,
                  fontSize:   14,
                }}
              >
                {role.num}
              </div>
              <h3
                style={{
                  fontFamily:    S.serif,
                  fontWeight:    600,
                  fontSize:      28,
                  margin:        0,
                  color:         S.fg1,
                  letterSpacing: "0.01em",
                }}
              >
                {role.name}
              </h3>
              <div
                style={{
                  fontFamily: S.serif,
                  fontStyle:  "italic",
                  color:      S.gold,
                  fontSize:   14,
                }}
              >
                {role.gloss}
              </div>
            </div>
            <p
              style={{
                fontFamily: S.sans,
                fontSize:   15,
                lineHeight: 1.7,
                color:      "var(--muted-foreground)",
                margin:     0,
                maxWidth:   "60ch",
              }}
            >
              {role.desc}
            </p>
          </div>
        ))}
      </div>

      <PullQuote>
        The combinations are endless. The blender&apos;s job is to make the cigar taste like one thing instead of four.
      </PullQuote>

      <SectionHeading>Sun &amp; <Em>Shade</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        There are two ways to grow the leaf. <em style={{ color: S.gold, fontStyle: "italic" }}>Sun-grown</em> plants stand in open fields under whatever the sky decides to send them, and the leaves come up thick, oily, dark, and full of flavor, the wrappers tougher and more rustic, the fillers strong. <em style={{ color: S.gold, fontStyle: "italic" }}>Shade-grown</em> plants spend their lives under tents of cheesecloth or muslin called <em style={{ color: S.gold, fontStyle: "italic" }}>tapados</em>, which diffuse the sunlight and keep the leaves thinner, paler, and more elegant. Shade leaf is what gets used for the silky golden wrappers on classic American premium cigars. It costs more, takes longer, and yields less. It is also what built the Connecticut Valley as a tobacco region a century ago.
      </p>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Most of the great wrapper leaf in the world today is shade-grown. Most of the great filler is sun-grown. The cigar in hand is almost always both at once.
      </p>

      <SectionRule />

      <SectionHeading>The <Em>Land</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Every cigar is a particular dirt. The same seed planted in different soil produces a different cigar; the same soil planted with different seed produces a different cigar. The countries below are the working geography of the modern cigar world.
      </p>

      {/* Lands grid */}
      <div
        style={{
          margin:      "32px 0 12px",
          display:     "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          borderTop:   "1px solid rgba(212,160,74,0.18)",
          borderLeft:  "1px solid rgba(212,160,74,0.18)",
        }}
      >
        {LANDS.map((land) => (
          <div
            key={land.name}
            style={{
              padding:     "22px 24px",
              borderRight: "1px solid rgba(212,160,74,0.18)",
              borderBottom:"1px solid rgba(212,160,74,0.18)",
              background:  "var(--card)",
            }}
          >
            <div
              style={{
                display:        "flex",
                alignItems:     "baseline",
                justifyContent: "space-between",
                gap:            12,
                marginBottom:   10,
              }}
            >
              <h3
                style={{
                  fontFamily:    S.serif,
                  fontWeight:    600,
                  fontSize:      22,
                  letterSpacing: "0.02em",
                  margin:        0,
                  color:         S.gold,
                  fontStyle:     "italic",
                }}
              >
                {land.name}
              </h3>
              <span
                style={{
                  fontFamily:    S.sans,
                  fontSize:      10.5,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color:         S.fg3,
                  whiteSpace:    "nowrap",
                }}
              >
                {land.region}
              </span>
            </div>
            <p
              style={{
                fontFamily: S.sans,
                fontSize:   14,
                lineHeight: 1.6,
                color:      "var(--muted-foreground)",
                margin:     0,
              }}
            >
              {land.desc}
            </p>
          </div>
        ))}
      </div>

      <SectionRule />

      <SectionHeading>The <Em>Colors</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Wrapper colors run from nearly green to nearly black, and each color tells a story about how the leaf was grown and cured. Color is not a perfect predictor of strength, but it is a good first signal of what kind of cigar is about to be lit.
      </p>

      {/* Colors panel */}
      <div
        style={{
          margin:       "28px 0 8px",
          background:   "var(--card)",
          border:       "1px solid rgba(212,160,74,0.22)",
          borderRadius: 6,
          padding:      "28px 24px",
        }}
      >
        <div
          style={{
            fontFamily:    S.sans,
            fontSize:      10.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "var(--muted-foreground)",
            textAlign:     "center",
            marginBottom:  4,
          }}
        >
          Wrapper Color Scale
        </div>
        <h3
          style={{
            fontFamily:  S.serif,
            fontWeight:  600,
            fontSize:    22,
            textAlign:   "center",
            margin:      "0 0 22px",
            color:       S.fg1,
          }}
        >
          From <em style={{ color: S.gold, fontStyle: "italic", fontWeight: 500 }}>Candela</em> to <em style={{ color: S.gold, fontStyle: "italic", fontWeight: 500 }}>Oscuro</em>
        </h3>
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            border:              "1px solid rgba(212,160,74,0.18)",
          }}
        >
          {COLORS.map((c, i) => (
            <div
              key={c.name}
              style={{
                padding:     "14px 10px",
                borderRight: i < COLORS.length - 1 ? "1px solid rgba(0,0,0,0.25)" : "none",
                textAlign:   "center",
              }}
            >
              <div
                style={{
                  height:      56,
                  marginBottom:10,
                  border:      "1px solid rgba(0,0,0,0.3)",
                  background:  c.cls,
                }}
              />
              <div
                style={{
                  fontFamily:    S.serif,
                  fontWeight:    600,
                  fontSize:      12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color:         S.fg1,
                }}
              >
                {c.name}
              </div>
              <div
                style={{
                  fontFamily: S.serif,
                  fontStyle:  "italic",
                  color:      S.gold,
                  fontSize:   10.5,
                  marginTop:  2,
                }}
              >
                {c.alt}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "25px 0 22px" }}>
        <em style={{ color: S.gold, fontStyle: "italic" }}>Candela</em>, also called double claro, is the rare yellow-green wrapper that comes from heat-curing the leaf before chlorophyll can break down, a style that was once the American standard and is now a curiosity. <em style={{ color: S.gold, fontStyle: "italic" }}>Maduro</em>, dark and oily and sweet, is the result of long fermentation and the selection of thicker upper leaves. <em style={{ color: S.gold, fontStyle: "italic" }}>Oscuro</em>, sometimes called double maduro, is nearly black.
      </p>

      <SectionRule />

      <SectionHeading>The <Em>Final Step</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        After the leaf is harvested and cured and stacked into <em style={{ color: S.gold, fontStyle: "italic" }}>pilones</em> to ferment, it gets aged. Sometimes for months. Sometimes for years. The longer the aging, the smoother the leaf, the more the harsher compounds break down, the more the flavors integrate. A great cigar has aged tobacco in it. There is no shortcut. The factories that take the time produce the cigars that taste like time.
      </p>

      <PullQuote>
        Every cigar is the work of a particular dirt, a particular sky, and a particular pair of hands that knew which leaf to pick at the right moment.
      </PullQuote>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        The same seed planted in different soil produces a different cigar. The same soil planted with different seed produces a different cigar. The leaf is the whole game.
      </p>

      <Closer />
    </ArticleShell>
  );
}
