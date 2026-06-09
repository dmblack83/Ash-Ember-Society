/* Invite Friends — shared invite content + sms: deep-link builder.
   Kept framework-free so it can be unit-tested under the Vitest lib/** glob. */

export const SIGNUP_URL = "https://www.ashember.vip/signup";

export const INVITE_MESSAGE = `Join me on Ash & Ember! ${SIGNUP_URL}`;

/**
 * Builds an `sms:` deep link with the invite message prefilled.
 *
 * The body-parameter separator differs by platform: iOS expects `sms:&body=`,
 * Android expects `sms:?body=`. The `sms:?&body=` form prefills on both, so no
 * platform sniffing is required.
 */
export function buildInviteSmsHref(): string {
  return `sms:?&body=${encodeURIComponent(INVITE_MESSAGE)}`;
}
