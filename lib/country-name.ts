const COUNTRY_NAMES: Record<string, string> = {
  AF: "Afghanistan", AL: "Albania", DZ: "Algeria", AO: "Angola",
  AR: "Argentina", AM: "Armenia", AU: "Australia", AT: "Austria",
  AZ: "Azerbaijan", BS: "Bahamas", BD: "Bangladesh", BE: "Belgium",
  BZ: "Belize", BJ: "Benin", BO: "Bolivia", BR: "Brazil",
  BG: "Bulgaria", BF: "Burkina Faso", BI: "Burundi", CM: "Cameroon",
  CA: "Canada", CF: "Central African Republic", TD: "Chad", CL: "Chile",
  CN: "China", CO: "Colombia", CG: "Congo", CR: "Costa Rica",
  HR: "Croatia", CU: "Cuba", CY: "Cyprus", CZ: "Czech Republic",
  DK: "Denmark", DO: "Dominican Republic", EC: "Ecuador", EG: "Egypt",
  SV: "El Salvador", ET: "Ethiopia", FI: "Finland", FR: "France",
  GH: "Ghana", GT: "Guatemala", GN: "Guinea", GY: "Guyana",
  HT: "Haiti", HN: "Honduras", HU: "Hungary", IN: "India",
  ID: "Indonesia", IR: "Iran", IQ: "Iraq", IE: "Ireland",
  IL: "Israel", IT: "Italy", JM: "Jamaica", JP: "Japan",
  JO: "Jordan", KZ: "Kazakhstan", KE: "Kenya", MG: "Madagascar",
  MW: "Malawi", MY: "Malaysia", ML: "Mali", MX: "Mexico",
  MA: "Morocco", MZ: "Mozambique", MM: "Myanmar", NL: "Netherlands",
  NZ: "New Zealand", NI: "Nicaragua", NG: "Nigeria", NO: "Norway",
  PK: "Pakistan", PA: "Panama", PY: "Paraguay", PE: "Peru",
  PH: "Philippines", PL: "Poland", PT: "Portugal", PR: "Puerto Rico",
  RO: "Romania", RU: "Russia", RW: "Rwanda", SA: "Saudi Arabia",
  SN: "Senegal", SL: "Sierra Leone", ZA: "South Africa", ES: "Spain",
  LK: "Sri Lanka", SD: "Sudan", SE: "Sweden", CH: "Switzerland",
  TW: "Taiwan", TZ: "Tanzania", TH: "Thailand", TG: "Togo",
  TT: "Trinidad and Tobago", TN: "Tunisia", TR: "Turkey",
  UG: "Uganda", UA: "Ukraine", GB: "United Kingdom",
  US: "United States", UY: "Uruguay", VE: "Venezuela", VN: "Vietnam",
  ZM: "Zambia", ZW: "Zimbabwe",
};

/** Returns the full country name for a 2-letter ISO code, or the input unchanged if not found. */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRY_NAMES[code.toUpperCase()] ?? code;
}

/**
 * For the `wrapper` field which can be either a 2-letter country code ("CU", "EC")
 * or a descriptor ("Connecticut Shade", "Colorado", "Maduro").
 * Converts codes to country names; leaves descriptors unchanged.
 */
export function wrapperDisplay(wrapper: string | null | undefined): string {
  if (!wrapper) return "";
  if (wrapper.length === 2 && /^[A-Z]{2}$/i.test(wrapper)) {
    return COUNTRY_NAMES[wrapper.toUpperCase()] ?? wrapper;
  }
  return wrapper;
}
