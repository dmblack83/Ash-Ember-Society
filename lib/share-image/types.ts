export interface SharePhoto {
  uri:    string;
  /* Intrinsic pixel dimensions, read server-side via sharp. Null when
     metadata could not be read; photo cells then fall back to a full-cell
     fit instead of natural-aspect math. */
  width:  number | null;
  height: number | null;
}

export interface ShareImageProps {
  reportNumber:         number | null;
  smokedAt:             string;
  cigar:                { brand: string | null; series: string | null; format: string | null } | null;
  overallRating:        number | null;
  drawRating:           number | null;
  burnRating:           number | null;
  constructionRating:   number | null;
  flavorRating:         number | null;
  reviewText:           string | null;
  smokeDurationMinutes: number | null;
  pairingDrink:         string | null;
  occasion:             string | null;
  flavorTagNames:       string[];
  photos:               SharePhoto[];
  thirdsEnabled:        boolean;
  thirdBeginning:       string | null;
  thirdMiddle:          string | null;
  thirdEnd:             string | null;
  thirdsTaggedRows:     Array<{ index: 1 | 2 | 3; flavor_tag_names: string[] }>;
  displayName:          string | null;
  city:                 string | null;
}
