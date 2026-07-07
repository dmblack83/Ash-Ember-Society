import { describe, it, expect, vi, afterEach } from "vitest";
import { ttlCache } from "../cached-lookups";

afterEach(() => {
  vi.useRealTimers();
});

describe("ttlCache", () => {
  it("serves the cached value within the TTL without reloading", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue("v1");
    const get = ttlCache(1000, load);

    await expect(get()).resolves.toBe("v1");
    vi.advanceTimersByTime(500);
    await expect(get()).resolves.toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL expires", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    const get = ttlCache(1000, load);

    await expect(get()).resolves.toBe("v1");
    vi.advanceTimersByTime(1001);
    await expect(get()).resolves.toBe("v2");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache rejections — next call retries", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce("recovered");
    const get = ttlCache(60_000, load);

    await expect(get()).rejects.toThrow("network down");
    await expect(get()).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent callers onto one in-flight load", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const get = ttlCache(60_000, load);

    const a = get();
    const b = get();
    resolve("shared");
    await expect(a).resolves.toBe("shared");
    await expect(b).resolves.toBe("shared");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
