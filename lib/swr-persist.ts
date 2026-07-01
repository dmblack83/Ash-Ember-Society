/* ------------------------------------------------------------------
   SWR persistent cache — localStorage-backed, allowlisted, user-partitioned.

   Read side of the offline story (the write side is the IndexedDB
   outbox in lib/offline-outbox.ts). On cold launch the SWR cache
   hydrates SYNCHRONOUSLY from one localStorage blob, so humidor /
   lounge / news render last-known data on the first client render —
   no network, no skeleton — and SWR revalidates in the background.

   Safety model (mirrors the SW authPartitionPlugin + outbox):
   - Only allowlisted key FAMILIES persist. Per-user families are
     additionally self-partitioning because every key embeds userId,
     so a restored entry for user A can never be READ by user B.
   - The blob is stamped with the owning userId. When the session
     resolves to a different user (or SIGNED_OUT fires), per-user
     entries are stripped from the live cache and the blob is deleted
     — same orphan-wipe discipline as the outbox.
   - Entries holding errors or undefined data never persist.
   - Priority-ordered byte budget caps the blob well under the
     localStorage quota; blobs older than MAX_AGE are discarded whole.

   Why localStorage and not IndexedDB: hydration must be synchronous
   to have the data present on the FIRST render (the whole point).
   IDB is async-only, which would reintroduce a skeleton flash and a
   post-hydration cache-population pass. The budget keeps the blob a
   fraction of the localStorage quota, and the one-time parse at boot
   is single-digit milliseconds at that size.
   ------------------------------------------------------------------ */

export const CACHE_BLOB_VERSION = 1;

const STORAGE_KEY = "ae-swr-cache-v1";
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000; /* 7 days */
const BUDGET_BYTES = 1_500_000;              /* ~1.5 MB of a ~5 MB quota */

export interface PersistFamily {
  family:  string;
  perUser: boolean;
}

/* Priority order = pack order: when the byte budget runs out, the
   bottom of this list is dropped first. */
export const PERSIST_FAMILIES: PersistFamily[] = [
  { family: "humidor-items",   perUser: true  },
  { family: "wishlist",        perUser: true  },
  { family: "wishlist-has",    perUser: true  },
  { family: "profile",         perUser: true  },
  { family: "account-profile", perUser: true  },
  { family: "home-aging",      perUser: true  },
  { family: "burn-reports",    perUser: true  },
  { family: "humidor-stats",   perUser: true  },
  { family: "lounge-feed",     perUser: true  },
  { family: "news-latest",     perUser: false },
  { family: "news-page",       perUser: false },
  { family: "cigar-search",    perUser: false },
  { family: "cigar",           perUser: false },
];

export interface PersistBlob {
  v:       number;
  ownerId: string | null;
  savedAt: number;
  entries: [string, unknown][];
}

/* SWR serializes tuple keys as `@"family","arg",` (infinite keys add a
   `$inf$` prefix). Matching the QUOTED family token keeps "cigar" from
   matching "cigar-search". */
export function familyForKey(serializedKey: string): PersistFamily | null {
  for (const f of PERSIST_FAMILIES) {
    if (serializedKey.includes(`"${f.family}"`)) return f;
  }
  return null;
}

interface SwrCacheState {
  data?:  unknown;
  error?: unknown;
}

/** Filter + order + budget-cap live cache entries into a storable blob. */
export function packEntries(
  entries: [string, unknown][],
  opts: { budgetBytes: number; ownerId: string | null; now: number },
): PersistBlob {
  /* Collect eligible entries with their family for priority sorting. */
  const eligible: { key: string; data: unknown; priority: number }[] = [];
  for (const [key, value] of entries) {
    const fam = familyForKey(key);
    if (!fam) continue;
    if (fam.perUser && !opts.ownerId) continue;
    const state = value as SwrCacheState | null | undefined;
    if (!state || state.data === undefined || state.error !== undefined) continue;
    eligible.push({
      key,
      data:     state.data,
      priority: PERSIST_FAMILIES.findIndex((f) => f.family === fam.family),
    });
  }
  eligible.sort((a, b) => a.priority - b.priority);

  const packed: [string, unknown][] = [];
  let used = 0;
  for (const e of eligible) {
    let size: number;
    try {
      size = JSON.stringify(e.data)?.length ?? 0;
    } catch {
      continue; /* non-serializable data never persists */
    }
    if (used + size > opts.budgetBytes) continue;
    used += size;
    packed.push([e.key, e.data]);
  }

  return {
    v:       CACHE_BLOB_VERSION,
    ownerId: opts.ownerId,
    savedAt: opts.now,
    entries: packed,
  };
}

/** Parse + validate a stored blob. Null on any problem — corrupt or
    stale blobs are discarded whole rather than partially trusted. */
export function unpackBlob(
  raw: string | null,
  opts: { maxAgeMs: number; now: number },
): { ownerId: string | null; entries: [string, unknown][] } | null {
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as PersistBlob;
    if (blob.v !== CACHE_BLOB_VERSION) return null;
    if (typeof blob.savedAt !== "number") return null;
    if (opts.now - blob.savedAt > opts.maxAgeMs) return null;
    if (!Array.isArray(blob.entries)) return null;
    return { ownerId: blob.ownerId ?? null, entries: blob.entries };
  } catch {
    return null;
  }
}

/** Remove all per-user-family entries from a live cache map. Public
    families (news, catalog) survive — they're identical for any user. */
export function stripPerUserEntries(cache: Map<string, unknown>): void {
  for (const key of [...cache.keys()]) {
    const fam = familyForKey(key);
    if (fam?.perUser) cache.delete(key);
  }
}

/* ==================================================================
   Browser wiring — everything below touches window/localStorage and
   is only called from the client SWRProvider.
   ================================================================== */

/** Synchronously build the initial SWR cache map from the stored blob. */
export function loadCacheMap(): { cache: Map<string, unknown>; ownerId: string | null } {
  const cache = new Map<string, unknown>();
  if (typeof window === "undefined") return { cache, ownerId: null };

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode edge cases) — run memory-only */
  }
  const blob = unpackBlob(raw, { maxAgeMs: MAX_AGE_MS, now: Date.now() });
  if (!blob) return { cache, ownerId: null };

  for (const [key, data] of blob.entries) {
    cache.set(key, { data });
  }
  return { cache, ownerId: blob.ownerId };
}

export function clearPersisted(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function save(cache: Map<string, unknown>, ownerId: string | null): void {
  try {
    const blob = packEntries([...cache.entries()], {
      budgetBytes: BUDGET_BYTES,
      ownerId,
      now: Date.now(),
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    /* quota or serialization failure — persistence is best-effort */
  }
}

/**
 * Attach save triggers + auth ownership guards to the live cache.
 * Returns a cleanup function. `getSupabase` is injected so this
 * module stays import-safe in tests.
 */
export function attachCachePersistence(
  cache: Map<string, unknown>,
  initialOwnerId: string | null,
  supabase: {
    auth: {
      getSession: () => Promise<{ data: { session: { user?: { id: string } } | null } }>;
      onAuthStateChange: (
        cb: (event: string, session: { user?: { id: string } } | null) => void,
      ) => { data: { subscription: { unsubscribe: () => void } } };
    };
  },
): () => void {
  let owner = initialOwnerId;

  const handleUser = (uid: string | null) => {
    if (!uid) return; /* signed-out transitions handled by SIGNED_OUT */
    if (owner && owner !== uid) {
      /* Different account on the same device: same orphan-wipe
         discipline as the offline outbox. */
      stripPerUserEntries(cache);
      clearPersisted();
    }
    owner = uid;
  };

  void supabase.auth.getSession().then(({ data }) => {
    handleUser(data.session?.user?.id ?? null);
  });

  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      stripPerUserEntries(cache);
      clearPersisted();
      owner = null;
      return;
    }
    handleUser(session?.user?.id ?? null);
  });

  /* Persist when the app backgrounds — the reliable signals on iOS
     PWA (beforeunload is not). */
  const onVisibility = () => {
    if (document.visibilityState === "hidden") save(cache, owner);
  };
  const onPageHide = () => save(cache, owner);

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    sub.subscription.unsubscribe();
  };
}
