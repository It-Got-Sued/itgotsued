import type { OwnedItem } from "@/lib/types";

// My Items live in this browser's localStorage and, when signed in, in the account
// (/api/my-items), so the list survives logging out and back in on any device.
// Every storage access is wrapped: storage can be empty, blocked (private mode), or throw on quota.

const KEY = "classactionforme.myItems.v1";
// Id of the account this browser's list belongs to. Set after a successful sync.
const OWNER_KEY = "classactionforme.myItems.owner";

export function loadItems(): OwnedItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (i): i is OwnedItem =>
        !!i && typeof i === "object" && typeof i.id === "string" && typeof i.label === "string",
    );
  } catch {
    return [];
  }
}

/** Returns false when the list could not be saved (storage blocked or full). */
export function saveItems(items: OwnedItem[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function makeItem(label: string, brand?: string): OwnedItem {
  const item: OwnedItem = { id: newId(), label: label.trim(), addedAt: new Date().toISOString() };
  if (brand?.trim() && brand.trim().toLowerCase() !== item.label.toLowerCase()) item.brand = brand.trim();
  return item;
}

/** Appends items whose label isn't already in the list (case-insensitive). */
export function mergeItems(existing: OwnedItem[], incoming: { label: string; brand?: string }[]) {
  const seen = new Set(existing.map((i) => i.label.toLowerCase()));
  const added: OwnedItem[] = [];
  for (const { label, brand } of incoming) {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    added.push(makeItem(label, brand));
  }
  return { items: [...existing, ...added], added: added.length };
}

function readOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(OWNER_KEY, id);
    else window.localStorage.removeItem(OWNER_KEY);
  } catch {
    // Storage blocked: the account copy is still the source of truth.
  }
}

// --- Account sync ------------------------------------------------------------
// "account": signed in and this browser holds that account's list, so edits are PUT.
// "local": signed out. "unknown": not checked since the page loaded or last mount.
let mode: "unknown" | "local" | "account" = "unknown";
let syncing: Promise<void> | null = null;
let dirtyDuringSync = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

type AccountList = { userId: string; items: OwnedItem[] };

async function accountRequest(init?: RequestInit): Promise<AccountList | null | "error"> {
  try {
    const res = await fetch("/api/my-items", { ...init, cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) return null;
    if (!res.ok) return "error";
    return (await res.json()) as AccountList;
  } catch {
    return "error";
  }
}

function pushToAccount(items: OwnedItem[]): Promise<AccountList | null | "error"> {
  return accountRequest({
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

function applyLocal(items: OwnedItem[]): void {
  cache = items;
  saveItems(items);
  listeners.forEach((l) => l());
}

/**
 * Reconciles this browser's list with the signed-in account:
 * - signed out after being signed in here: clear the local copy (shared devices).
 * - first sync on this device: merge local items into the account.
 * - same account as before: the account copy wins (it may have changed elsewhere),
 *   plus anything added here while this sync was in flight.
 * - a different account: replace the local copy with that account's list.
 */
export function syncWithAccount(localEdit = false): Promise<void> {
  if (syncing) {
    if (localEdit) dirtyDuringSync = true;
    return syncing;
  }
  dirtyDuringSync = localEdit;
  syncing = (async () => {
    const res = await accountRequest();
    if (res === "error") {
      mode = "unknown";
      return;
    }
    const owner = readOwner();
    if (res === null) {
      mode = "local";
      if (owner) {
        writeOwner(null);
        applyLocal([]);
      }
      return;
    }
    let next = res.items;
    if (owner === null || (owner === res.userId && dirtyDuringSync)) {
      // Append local items the account doesn't have yet, keeping their ids and dates.
      const seen = new Set(res.items.map((i) => i.label.trim().toLowerCase()));
      next = [...res.items, ...getItemsSnapshot().filter((i) => !seen.has(i.label.trim().toLowerCase()))];
    }
    writeOwner(res.userId);
    mode = "account";
    applyLocal(next);
    if (next.length !== res.items.length) await pushToAccount(next);
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

function schedulePush(): void {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const res = await pushToAccount(getItemsSnapshot());
    if (res === null) {
      // Session ended since the last sync.
      mode = "unknown";
      void syncWithAccount();
    }
  }, 400);
}

// Minimal external store so every component sees the same list.
// The server snapshot is null ("not loaded yet"); the client reads storage lazily.
let cache: OwnedItem[] | null = null;
const listeners = new Set<() => void>();

export function subscribeItems(cb: () => void): () => void {
  // Re-check the account whenever a list view mounts: the user may have signed in or
  // out through a client-side navigation since the last check.
  if (listeners.size === 0) {
    mode = "unknown";
    void syncWithAccount();
  }
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = loadItems();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function getItemsSnapshot(): OwnedItem[] {
  if (cache === null) cache = loadItems();
  return cache;
}

export function getItemsServerSnapshot(): OwnedItem[] | null {
  return null;
}

/** Updates the shared list; returns false if it could not be persisted. */
export function setItems(items: OwnedItem[]): boolean {
  cache = items;
  const ok = saveItems(items);
  listeners.forEach((l) => l());
  if (mode === "account" && !syncing) schedulePush();
  // Signed-in state unknown or a sync in flight: sync merges this edit into the account, if any.
  else void syncWithAccount(true);
  return ok || mode === "account";
}

/** Adds items to the stored list; returns how many were new, or null if storage failed. */
export function addToStoredItems(incoming: { label: string; brand?: string }[]): number | null {
  const { items, added } = mergeItems(getItemsSnapshot(), incoming);
  if (added === 0) return 0;
  return setItems(items) ? added : null;
}

/** Splits pasted text on new lines and commas. */
export function splitList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter(Boolean);
}
