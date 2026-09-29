import type { OwnedItem } from "@/lib/types";

// My Items live only in this browser's localStorage. Every access is wrapped:
// storage can be empty, blocked (private mode), or throw on quota.

const KEY = "classactionforme.myItems.v1";

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

// Minimal external store so every component sees the same list.
// The server snapshot is null ("not loaded yet"); the client reads storage lazily.
let cache: OwnedItem[] | null = null;
const listeners = new Set<() => void>();

export function subscribeItems(cb: () => void): () => void {
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
  return ok;
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
