import { describe, it, expect } from "vitest";
import { SIGNUP_URL, INVITE_MESSAGE, buildInviteSmsHref } from "../invite";

const HREF_PREFIX = "sms:?&body=";

describe("invite", () => {
  it("SIGNUP_URL is the www signup URL", () => {
    expect(SIGNUP_URL).toBe("https://www.ashember.vip/signup");
  });

  it("INVITE_MESSAGE is the exact invite copy with the signup URL", () => {
    expect(INVITE_MESSAGE).toBe(
      "Join me on Ash & Ember! https://www.ashember.vip/signup",
    );
  });

  it("buildInviteSmsHref uses the cross-platform sms:?&body= prefix", () => {
    expect(buildInviteSmsHref().startsWith(HREF_PREFIX)).toBe(true);
  });

  it("encodes the body so it decodes back to the exact message", () => {
    const body = buildInviteSmsHref().slice(HREF_PREFIX.length);
    expect(decodeURIComponent(body)).toBe(INVITE_MESSAGE);
    expect(body).toContain("%26"); // & is encoded
    expect(body).not.toContain(" "); // spaces are encoded
  });
});
