/**
 * Shared rules for choosing a new password. Used by the password-reset
 * flow; kept pure so it can be unit-tested without a Supabase client.
 *
 * Mirrors the rules already enforced in the account password-change UI
 * (min 8 chars, confirmation must match). If these rules change, update
 * both call sites.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Validate a new password and its confirmation.
 *
 * @returns A user-facing error string, or `null` when the input is valid.
 *          Length is checked before the match so the user fixes the more
 *          fundamental problem first.
 */
export function validateNewPassword(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmation) {
    return "Passwords don't match.";
  }
  return null;
}
