"use client";

/* ------------------------------------------------------------------
   Offline mutation outbox — IndexedDB CRUD.

   Foundation layer for Phase 5 P5.6 (background sync). When a fetch
   mutation fails because the user is offline (or hits a 5xx), the
   call site can enqueue the request here. The service worker's
   `sync` event handler in app/sw.ts replays queued records when
   connectivity returns.

   Records are pinned to user_id at queue time. The OutboxManager
   client component drops orphan records (different user_id) on
   sign-out / sign-in to prevent cross-user replay on shared
   devices.

   The IDB schema is intentionally minimal — a single object store
   keyed by record id. No background-sync metadata (attempts,
   next_attempt_at) lives here; the SW replays everything on each
   sync event and deletes successes. Failures stay in the store
   for the next sync. If a record stays stuck for too long it'll
   accumulate, but the practical horizon for offline-mutation
   intent is hours, not days — pruning isn't urgent in v1.

   Browsers without IndexedDB (very old) or PushManager-like
   sandbox limits silently no-op; mutations through this module
   become regular failed fetches, which is the existing behaviour.
   ------------------------------------------------------------------ */

const DB_NAME    = "ae-offline-outbox";
const DB_VERSION = 1;
const STORE      = "mutations";

export interface OutboxRecord {
  id:         string;
  user_id:    string;
  /** Tag for diagnostics. e.g. "burn-report", "lounge-post". */
  category:   string;
  url:        string;
  method:     string;
  /** Headers serialized as a flat object. Cookies travel with the
      replay automatically (credentials: "include") — don't put auth
      tokens in here. */
  headers:    Record<string, string>;
  /** Body must be JSON-serializable text or null. multipart/form-data
      bodies (file uploads) are NOT supported in v1 — they're tied to
      File objects that aren't durable across page reloads. Adding
      file-mutation support means storing the bytes too; future work. */
  body:       string | null;
  contentType: string | null;
  created_at: number;
}

function isIDBAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror   = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("user_id",    "user_id",    { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
  });
}

/* ------------------------------------------------------------------
   Public API
   ------------------------------------------------------------------ */

export async function enqueueMutation(
  record: Omit<OutboxRecord, "id" | "created_at">,
): Promise<string | null> {
  if (!isIDBAvailable()) return null;

  const id   = crypto.randomUUID();
  const full: OutboxRecord = { ...record, id, created_at: Date.now() };

  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx  = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).add(full);
      req.onerror   = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
    return id;
  } finally {
    db.close();
  }
}

export async function listMutations(userId?: string): Promise<OutboxRecord[]> {
  if (!isIDBAvailable()) return [];

  const db = await openDB();
  try {
    return await new Promise<OutboxRecord[]>((resolve, reject) => {
      const tx    = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req   = userId
        ? store.index("user_id").getAll(userId)
        : store.getAll();
      req.onerror   = () => reject(req.error);
      req.onsuccess = () => resolve(req.result as OutboxRecord[]);
    });
  } finally {
    db.close();
  }
}

export async function dequeueMutation(id: string): Promise<void> {
  if (!isIDBAvailable()) return;

  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Drop all records owned by another user_id. Called from
    OutboxManager on auth changes — prevents User A's queued
    mutations from being replayed under User B's session. */
export async function clearMutationsExceptUser(currentUserId: string): Promise<number> {
  if (!isIDBAvailable()) return 0;

  const db = await openDB();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx     = db.transaction(STORE, "readwrite");
      const store  = tx.objectStore(STORE);
      const req    = store.getAll();
      let deleted  = 0;
      req.onerror   = () => reject(req.error);
      req.onsuccess = () => {
        for (const rec of req.result as OutboxRecord[]) {
          if (rec.user_id !== currentUserId) {
            store.delete(rec.id);
            deleted += 1;
          }
        }
      };
      tx.oncomplete = () => resolve(deleted);
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Convenience wrapper: enqueue a JSON fetch mutation and request
    a background sync in one call. Used by call sites that catch a
    failed fetch and want to retry it in the background.

    Returns the queued record id (or null if IDB is unavailable or
    the user isn't authed at queue time). */
export async function enqueueFetchMutation(args: {
  url:      string;
  method:   "POST" | "PUT" | "PATCH" | "DELETE";
  body:     unknown;
  category: string;
  userId:   string;
}): Promise<string | null> {
  const id = await enqueueMutation({
    user_id:     args.userId,
    category:    args.category,
    url:         args.url,
    method:      args.method,
    headers:     { "Content-Type": "application/json" },
    body:        JSON.stringify(args.body),
    contentType: "application/json",
  });
  if (id) {
    /* Best-effort. Browsers without SyncManager rely on the
       OutboxManager's online-event fallback for replay. */
    void requestBackgroundSync();
  }
  return id;
}

/** Heuristic: true when an error from fetch() is most likely caused
    by being offline rather than by an HTTP error response. Both
    `navigator.onLine === false` and the canonical TypeError fired
    by fetch on network failure are treated as offline. */
export function isLikelyOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (err instanceof TypeError) {
    const msg = err.message?.toLowerCase() ?? "";
    if (msg.includes("fetch")  || msg.includes("network") ||
        msg.includes("offline")) return true;
  }
  return false;
}

/** Register a BackgroundSync tag with the service worker. Triggers
    the SW's sync event when connectivity returns (Chromium / Firefox).
    On Safari and other browsers without SyncManager, returns false —
    the OutboxManager's online-event listener handles replay there. */
export async function requestBackgroundSync(tag = "ae-outbox-sync"): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  if (!("serviceWorker" in navigator))   return false;
  if (typeof window === "undefined" || !("SyncManager" in window)) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    /* `sync` is on ServiceWorkerRegistration but not in the default
       DOM lib types. Cast to any to access. */
    const sync = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (!sync) return false;
    await sync.register(tag);
    return true;
  } catch {
    return false;
  }
}
