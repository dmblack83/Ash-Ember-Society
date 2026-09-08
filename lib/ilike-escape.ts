/* ------------------------------------------------------------------
   escapeIlikeExact

   Postgres ILIKE treats `%` and `_` as wildcards; to use `.ilike(col,
   value)` as a case-insensitive EXACT-match lookup (the trick used for
   normalized line-identity lookups — see supabase/migrations/
   20260909_line_identity_normalize.sql), the value must have its
   wildcard characters escaped first. With no live wildcards left,
   ILIKE behaves as plain case-insensitive equality.

   Postgres' default LIKE/ILIKE escape character is backslash, so a
   literal backslash in the input must be escaped first (otherwise it
   would itself act as an escape character for the following char).
   ------------------------------------------------------------------ */
export function escapeIlikeExact(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
