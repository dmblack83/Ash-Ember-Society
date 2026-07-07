import { describe, it, expect } from "vitest";
import { keyFor } from "../keys";

describe("keyFor.loungeFeed", () => {
  it("uses a stable sentinel for the all-categories feed", () => {
    const key = keyFor.loungeFeed(null, 0, "user-1", "all", "new");
    expect(key).toEqual(["lounge-feed", "all-categories", 0, "user-1", "all", "new"]);
  });

  it("keeps category feeds distinct from the all feed", () => {
    const all = keyFor.loungeFeed(null, 0, "user-1", "all", "new");
    const cat = keyFor.loungeFeed("cat-9", 0, "user-1", "all", "new");
    expect(all).not.toEqual(cat);
  });

  it("partitions the cache by sort", () => {
    const hot = keyFor.loungeFeed(null, 0, "user-1", "all", "hot");
    const fresh = keyFor.loungeFeed(null, 0, "user-1", "all", "new");
    expect(hot).not.toEqual(fresh);
  });

  it("defaults filter to all and sort to new", () => {
    expect(keyFor.loungeFeed("cat-9", 1, "user-1")).toEqual(
      ["lounge-feed", "cat-9", 1, "user-1", "all", "new"],
    );
  });
});

describe("keyFor.loungeShell", () => {
  it("is keyed per user", () => {
    expect(keyFor.loungeShell("user-1")).toEqual(["lounge-shell", "user-1"]);
    expect(keyFor.loungeShell("user-1")).not.toEqual(keyFor.loungeShell("user-2"));
  });
});
