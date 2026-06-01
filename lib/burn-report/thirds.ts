/* ------------------------------------------------------------------
   Burn Report -- Thirds utilities

   Pure helpers shared by client (BurnReport.tsx, VerdictCard.tsx) and
   server (app/api/burn-report/route.ts). No React, no Supabase, no
   network -- safe to import from anywhere.
   ------------------------------------------------------------------ */

export interface PerThirdData {
  notes:                string;
  draw_rating:          number;  // 1-5 integer
  burn_rating:          number;
  construction_rating:  number;
  flavor_rating:        number;
  flavor_tag_ids:       string[];
  /* photo_index points into the photo upload array for the request;
     present only when the user attached a photo to this third. */
  photo_index?:         number;
}

export interface AveragedRatings {
  draw_rating:          number;
  burn_rating:          number;
  construction_rating:  number;
  flavor_rating:        number;
}

/* Round up to the nearest quarter (0.25). Capped at 5.0. */
export function roundUpToQuarter(value: number): number {
  if (value <= 0) return 0;
  if (value >= 5) return 5;
  return Math.min(5, Math.ceil(value * 4) / 4);
}

/* Average four rating dimensions across three thirds and round
   each up to the nearest quarter. Caller is responsible for
   passing exactly 3 entries when thirds is enabled. */
export function averageThirdsToQuarter(thirds: PerThirdData[]): AveragedRatings {
  const n = thirds.length;
  if (n === 0) {
    return { draw_rating: 0, burn_rating: 0, construction_rating: 0, flavor_rating: 0 };
  }
  const sum = thirds.reduce(
    (acc, t) => ({
      draw_rating:         acc.draw_rating         + t.draw_rating,
      burn_rating:         acc.burn_rating         + t.burn_rating,
      construction_rating: acc.construction_rating + t.construction_rating,
      flavor_rating:       acc.flavor_rating       + t.flavor_rating,
    }),
    { draw_rating: 0, burn_rating: 0, construction_rating: 0, flavor_rating: 0 },
  );
  return {
    draw_rating:         roundUpToQuarter(sum.draw_rating         / n),
    burn_rating:         roundUpToQuarter(sum.burn_rating         / n),
    construction_rating: roundUpToQuarter(sum.construction_rating / n),
    flavor_rating:       roundUpToQuarter(sum.flavor_rating       / n),
  };
}
