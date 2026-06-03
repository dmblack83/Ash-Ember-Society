import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { trackReliability } from "../reliability";

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}));

describe("trackReliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sentry.captureMessage with reliability:bucket.subtype message", () => {
    trackReliability({ bucket: "sw_lifecycle", subtype: "activate_fail" });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "reliability:sw_lifecycle.activate_fail",
      expect.any(Object),
    );
  });

  it("applies the type=reliability tag and bucket/subtype tags", () => {
    trackReliability({ bucket: "auth_session", subtype: "jwt_verify_fail", cause: "bad_signature" });
    const call = vi.mocked(Sentry.captureMessage).mock.calls[0];
    const opts = call[1] as { tags: Record<string, string> };
    expect(opts.tags.type).toBe("reliability");
    expect(opts.tags.bucket).toBe("auth_session");
    expect(opts.tags.subtype).toBe("jwt_verify_fail");
    expect(opts.tags.cause).toBe("bad_signature");
  });

  it("defaults cause tag to 'unknown' when omitted", () => {
    trackReliability({ bucket: "ios_webkit", subtype: "splash_fail" });
    const opts = vi.mocked(Sentry.captureMessage).mock.calls[0][1] as { tags: Record<string, string> };
    expect(opts.tags.cause).toBe("unknown");
  });

  it("sets level to warning", () => {
    trackReliability({ bucket: "state_persistence", subtype: "draft_save_fail" });
    const opts = vi.mocked(Sentry.captureMessage).mock.calls[0][1] as { level: string };
    expect(opts.level).toBe("warning");
  });

  it("truncates detail to 200 chars", () => {
    const long = "x".repeat(300);
    trackReliability({ bucket: "network_resilience", subtype: "fetch_timeout", detail: long });
    const opts = vi.mocked(Sentry.captureMessage).mock.calls[0][1] as { extra: { detail: string } };
    expect(opts.extra.detail).toHaveLength(200);
  });

  it("merges custom extra fields after detail", () => {
    trackReliability({
      bucket: "network_resilience",
      subtype: "body_too_large",
      extra: { size_bytes: 5_000_000 },
    });
    const opts = vi.mocked(Sentry.captureMessage).mock.calls[0][1] as { extra: Record<string, unknown> };
    expect(opts.extra.size_bytes).toBe(5_000_000);
  });
});
