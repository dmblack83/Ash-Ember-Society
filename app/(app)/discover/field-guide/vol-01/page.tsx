import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
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

export default async function Vol01Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ArticleShell
      volNumber="Vol. 01"
      volLabel="Field Guide · Vol. 01 · A Brief History"
      eyebrow="Field Guide · Volume One"
      kicker="The Origin"
      title={<>A Brief <Em>History</Em><br />of the Cigar</>}
      deck="Five centuries of agriculture, weather, geography, and patient human hands - wound up tight, ready to hand back about an hour of life on better terms than it found things."
      meta={
        <>
          <span>Ash &amp; Ember Society</span>
          <span style={{ color: S.gold }}>&bull;</span>
          <span>Read 8 min</span>
          <span style={{ color: S.gold }}>&bull;</span>
          <span>1492 - Today</span>
        </>
      }
    >
      {/* First paragraph with drop cap */}
      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        <span
          style={{
            fontFamily:  S.serif,
            fontSize:    "4.4em",
            float:       "left",
            lineHeight:  0.85,
            padding:     "8px 12px 0 0",
            color:       S.gold,
            fontWeight:  700,
          }}
        >
          A
        </span>
        cigar is a five-hundred-year-old conversation that happens to be on fire. Five centuries of agriculture, weather, geography, and patient human hands, all wound up tight, ready to hand back about an hour of life on better terms than it found things. Worth knowing how it got here.
      </p>

      <SectionHeading>The Beach at <Em>Guanahaní</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        It starts in October of 1492. Two of Columbus&apos;s crew walk inland on a Caribbean beach and watch the locals doing something nobody back in Europe has ever seen a person do. They are setting fire to a tight roll of dried leaves and breathing the smoke. One of the sailors, a man named Rodrigo de Jerez, watches for a while, decides this looks fantastic, and tries it. He likes it. He likes it enough to bring the habit home to Spain, where his neighbors see him exhaling smoke and immediately decide he must be possessed by the devil. He spends the next seven years in an Inquisition cell. One hell of a price to pay for being the first European with good taste. By the time he gets out, half of Spain is doing it anyway.
      </p>

      <PullQuote>
        That is the cigar in miniature. The people who do not understand it always try to take it away. They always lose.
      </PullQuote>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        The leaf moved fast after that. Lisbon, then Paris, then London, then everywhere. Smuggled in saddlebags. Taxed by kings. Banned by popes. Lit anyway. By the 1700s the Spanish had figured out something quietly enormous, which was that the dirt in the Vuelta Abajo region of western Cuba was producing tobacco that nothing else on the planet could touch. Red soil that drained right. Rain in the right months. Sun at the right angle. Some unrepeatable combination of geology and weather that growers in twenty other countries have spent two hundred years trying to copy and never quite gotten there. That is why Cuba became Cuba. It was not marketing. It was the dirt.
      </p>

      <SectionRule />

      <SectionHeading>A Reader on a <Em>Platform</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        A working Havana factory in the middle of the afternoon has a particular quality to it. The room is long and hot and full of light. A hundred people sit at wooden boards with curved knives in their hands, and the air is so thick with leaf the taste of it lands in the throat before the smell registers. Sweet. Leathery. A little barnyard. Like wet hay forgotten in a stall. But before any of that, before the smell catches up at all, there is the sound. Somebody is reading aloud.
      </p>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Since the 1860s, every serious Cuban cigar factory has had a <em style={{ color: S.gold, fontStyle: "italic" }}>lector</em>, a reader on a raised platform who reads to the rollers all day. News in the morning. A novel in the afternoon. The rollers vote on the book. They pay the reader themselves out of their own wages, because they decided a long time ago that boredom was the enemy and Tolstoy was the medicine. The cigar called the Montecristo got its name because the rollers in one factory could not stop asking the lector to read the damn book again, day after day, until the brand more or less named itself. That is what is sitting inside every box of Cuban cigars on every shelf in the world. A pair of hands, almost certainly a woman&apos;s in modern Cuba, ten hours at a wooden board with a knife and a stack of leaves, listening to a chapter of <em style={{ color: S.gold, fontStyle: "italic" }}>Anna Karenina</em> while she built the thing.
      </p>

      <SectionRule />

      <SectionHeading>Three Smokers, <Em>Three Habits</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Three smokers worth keeping in mind, because half the romance of any old craft is the company that gathered around it.
      </p>

      {/* Smokers 3-panel */}
      <div
        style={{
          display:      "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          margin:       "36px 0 12px",
          borderTop:    "1px solid rgba(212,160,74,0.2)",
          borderBottom: "1px solid rgba(212,160,74,0.2)",
        }}
      >
        {[
          {
            roman: "i.",
            name:  "Mark Twain",
            stat:  "40 / day",
            sub:   "by his own count",
          },
          {
            roman: "ii.",
            name:  "Winston Churchill",
            stat:  "8 - 10 / day",
            sub:   "for seventy years",
          },
          {
            roman: "iii.",
            name:  "John F. Kennedy",
            stat:  "1,200 Upmanns",
            sub:   "night before the embargo",
          },
        ].map((s, i) => (
          <div
            key={s.name}
            style={{
              padding:     "24px 18px",
              textAlign:   "center",
              borderRight: i < 2 ? "1px solid rgba(212,160,74,0.14)" : "none",
            }}
          >
            <div
              style={{
                fontFamily:    S.serif,
                fontStyle:     "italic",
                fontSize:      12,
                color:         S.gold,
                letterSpacing: "0.12em",
                marginBottom:  8,
              }}
            >
              {s.roman}
            </div>
            <div
              style={{
                fontFamily:  S.serif,
                fontWeight:  600,
                fontSize:    18,
                lineHeight:  1.1,
                marginBottom:6,
                color:       S.fg1,
              }}
            >
              {s.name}
            </div>
            <div
              style={{
                fontFamily:    S.sans,
                fontSize:      11,
                color:         S.fg3,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <strong
                style={{
                  display:       "block",
                  color:         S.gold,
                  fontFamily:    S.serif,
                  fontStyle:     "italic",
                  fontSize:      22,
                  fontWeight:    400,
                  marginBottom:  2,
                  letterSpacing: 0,
                  textTransform: "none",
                }}
              >
                {s.stat}
              </strong>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Mark Twain claimed forty cigars a day and probably was not lying. He liked to say that quitting smoking was the easiest thing in the world. He had done it a thousand times. Winston Churchill smoked between eight and ten a day for the better part of seventy years, almost all of them Cuban, mostly Romeo y Julietas, which is why the long elegant size on every cigar shop wall today is called a Churchill. He smoked through both world wars. He smoked through speeches. He smoked in the bath. When asked the secret to his long life he tended to credit cigars, whiskey, and the absence of exercise, and he made it to ninety. And then there is John F. Kennedy, who in February of 1962, the night before signing the Cuban trade embargo into law, sent his press secretary out into Washington with one job: buy every box of H. Upmann Petit Coronas the city contained. The poor guy came back at dawn with twelve hundred cigars. Kennedy signed the embargo the next morning and kept himself in Upmanns for the rest of his life. The audacity is almost beautiful. Power has its perks.
      </p>

      <SectionRule />

      <SectionHeading>The Diaspora, &amp; <Em>The Volcanic Soil</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        What happened after the embargo was the part nobody saw coming. The great Cuban families took their seeds, their knowledge, and their last names and walked out.
      </p>

      {/* Families roll-call */}
      <div
        style={{
          display:      "block",
          margin:       "28px 0",
          padding:      "22px 0",
          borderTop:    "1px solid rgba(212,160,74,0.22)",
          borderBottom: "1px solid rgba(212,160,74,0.22)",
          textAlign:    "center",
        }}
      >
        <div
          style={{
            fontFamily:    S.sans,
            fontSize:      10.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         S.fg3,
            marginBottom:  12,
          }}
        >
          The Families That Walked Out
        </div>
        <div
          style={{
            display:        "inline-flex",
            alignItems:     "baseline",
            justifyContent: "center",
            gap:            22,
            flexWrap:       "wrap",
            fontFamily:     S.serif,
            fontStyle:      "italic",
            fontWeight:     500,
            fontSize:       28,
            color:          S.gold,
            lineHeight:     1.2,
          }}
        >
          <span>The Padr&oacute;ns</span>
          <span style={{ color: "rgba(212,160,74,0.45)", fontStyle: "normal", fontSize: 18 }}>&#10022;</span>
          <span>The Fuentes</span>
          <span style={{ color: "rgba(212,160,74,0.45)", fontStyle: "normal", fontSize: 18 }}>&#10022;</span>
          <span>The Garc&iacute;as</span>
        </div>
      </div>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        They put roots down in the Dominican Republic, in Honduras, and especially in the volcanic soil around Estel&iacute;, Nicaragua, which turned out to be every bit as opinionated about tobacco as the dirt back home. Today some of the best cigars in the world come from those families, working land they have known for four or five generations, treating each harvest the way a serious winemaker treats a vintage. The honest truth is there has never been a better time to be smoking.
      </p>

      <SectionRule />

      <SectionHeading>Three to Five <Em>Years</Em></SectionHeading>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        What lands between two fingers in a quiet hour is three to five years of work. A seed in the ground. The plant topped and primed and harvested leaf by leaf, the lower priming first, the middle next, the top last. The leaves hanging in a curing barn until they turn from green to gold to brown. Then a <em style={{ color: S.gold, fontStyle: "italic" }}>pil&oacute;n</em>, a head-high mountain of fermenting tobacco that workers turn and restack for months, sometimes years, until the chemistry decides to behave. Then the leaf sorted by color and texture and vein, blended with two or three or four others, and handed to a roller. The roller stretches the wrapper across the board, lays in the binder, builds the bunch with the filler leaves in a specific order so it will draw right, rolls it tight and even, caps it with a perfect circle of leaf cut by hand. Then cedar. Then a box. Then a ship. Then a shelf. Every step done by a person. There is no shortcut anyone has found that does not make the cigar worse.
      </p>

      {/* Process timeline */}
      <div
        style={{
          margin:       "36px 0",
          padding:      "28px 0",
          borderTop:    "1px solid rgba(212,160,74,0.2)",
          borderBottom: "1px solid rgba(212,160,74,0.2)",
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
            marginBottom:  22,
          }}
        >
          Seed to Smoke &middot; The Long Road
        </div>
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap:                 0,
          }}
        >
          {[
            { num: "01", name: "Grow",        time: "~6 months"       },
            { num: "02", name: "Cure",        time: "45-60 days"      },
            { num: "03", name: "Ferment",     time: "months - years"  },
            { num: "04", name: "Roll & rest", time: "cedar, then time"},
          ].map((step, i) => (
            <div
              key={step.name}
              style={{
                padding:     "0 14px",
                borderRight: i < 3 ? "1px solid rgba(212,160,74,0.14)" : "none",
                textAlign:   "center",
              }}
            >
              <div
                style={{
                  fontFamily:  S.serif,
                  fontStyle:   "italic",
                  color:       S.gold,
                  fontSize:    18,
                  marginBottom:6,
                  display:     "block",
                }}
              >
                {step.num}
              </div>
              <div
                style={{
                  fontFamily:  S.serif,
                  fontWeight:  600,
                  fontSize:    14,
                  marginBottom:4,
                  color:       S.fg1,
                }}
              >
                {step.name}
              </div>
              <div
                style={{
                  fontFamily:    S.sans,
                  fontSize:      10.5,
                  color:         S.fg3,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {step.time}
              </div>
            </div>
          ))}
        </div>
      </div>

      <PullQuote>
        A slow object in a fast world - and one that earns the patience it asks for.
      </PullQuote>

      <p style={{ fontSize: 17, lineHeight: 1.78, color: S.fg1, margin: "0 0 22px" }}>
        Three to five years on average from seed to smoke. Every stick is a small piece of that lineage, lit and gone in an hour or so. Every great cigar is a small monument to the people who made the one before it. That is the legend. That is the craft. The rest is just smoke.
      </p>

      <Closer />
    </ArticleShell>
  );
}
