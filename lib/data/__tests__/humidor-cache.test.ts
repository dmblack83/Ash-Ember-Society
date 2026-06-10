import { describe, it, expect, vi, beforeEach } from "vitest";
import { keyFor } from "../keys";

/* Mock SWR's global mutate and the fetchers module so the helper is
   tested in isolation (no Supabase). mutate is mocked to await the data
   promise it's handed — mirrors real SWR — so a rejecting fetcher
   propagates into the helper's Promise.all and we can assert the swallow. */
const { mutateMock, fetchItemsMock, fetchHasWishlistMock } = vi.hoisted(() => ({
  mutateMock:           vi.fn(),
  fetchItemsMock:       vi.fn(),
  fetchHasWishlistMock: vi.fn(),
}));

vi.mock("swr", () => ({ mutate: mutateMock }));
vi.mock("../humidor-fetchers", () => ({
  fetchHumidorItems:     fetchItemsMock,
  fetchHasWishlistItems: fetchHasWishlistMock,
}));

import { revalidateHumidor } from "../humidor-cache";

beforeEach(() => {
  vi.clearAllMocks();
  mutateMock.mockImplementation((_key: unknown, data?: unknown) => Promise.resolve(data));
});

describe("revalidateHumidor", () => {
  it("re-pulls both the humidor list and wishlist-count keys with revalidate:false", async () => {
    fetchItemsMock.mockResolvedValue([{ id: "a" }]);
    fetchHasWishlistMock.mockResolvedValue(true);

    await revalidateHumidor("user-1");

    expect(mutateMock).toHaveBeenCalledTimes(2);
    expect(mutateMock).toHaveBeenCalledWith(
      keyFor.humidorItems("user-1"), expect.anything(), { revalidate: false },
    );
    expect(mutateMock).toHaveBeenCalledWith(
      keyFor.hasWishlist("user-1"), expect.anything(), { revalidate: false },
    );
  });

  it("swallows errors when a fetcher rejects (the write already succeeded)", async () => {
    fetchItemsMock.mockRejectedValue(new Error("network"));
    fetchHasWishlistMock.mockResolvedValue(false);

    await expect(revalidateHumidor("user-1")).resolves.toBeUndefined();
    expect(mutateMock).toHaveBeenCalledTimes(2);
  });
});
