// App state: My Items + followed brands (persisted on device with AsyncStorage) and
// the most recent match results (in memory, shown on the Results screen).
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { BrandMatch, OwnedItem } from '@shared/types';

const ITEMS_KEY = 'cafm.myItems.v1';
const FOLLOWS_KEY = 'cafm.follows.v1';

export interface Follow {
  brand: string;
  email: string;
  followedAt: string;
}

export interface MatchResults {
  title: string;
  matches: BrandMatch[];
}

interface AppState {
  loaded: boolean;
  items: OwnedItem[];
  /** Adds labels, skipping blanks and duplicates. Returns how many were added. */
  addItems: (labels: string[]) => number;
  updateItem: (id: string, patch: Partial<Pick<OwnedItem, 'label' | 'brand'>>) => void;
  removeItem: (id: string) => void;
  follows: Follow[];
  addFollow: (f: Follow) => void;
  lastEmail: string;
  results: MatchResults | null;
  setResults: (r: MatchResults | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Splits pasted text on new lines and commas into item labels. */
export function parseItemList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.replace(/^[\s\-*•\d.)]+/, '').trim())
    .filter(Boolean);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<OwnedItem[]>([]);
  const [follows, setFollows] = useState<Follow[]>([]);
  const [results, setResults] = useState<MatchResults | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([readJson<OwnedItem[]>(ITEMS_KEY, []), readJson<Follow[]>(FOLLOWS_KEY, [])]).then(
      ([i, f]) => {
        if (!alive) return;
        setItems(Array.isArray(i) ? i : []);
        setFollows(Array.isArray(f) ? f : []);
        setLoaded(true);
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, loaded]);
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows)).catch(() => {});
  }, [follows, loaded]);

  const addItems = useCallback(
    (labels: string[]) => {
      const seen = new Set(items.map((i) => i.label.toLowerCase()));
      const now = new Date().toISOString();
      const fresh: OwnedItem[] = [];
      for (const raw of labels) {
        const label = raw.trim();
        const key = label.toLowerCase();
        if (!label || seen.has(key)) continue;
        seen.add(key);
        fresh.push({ id: newId(), label, addedAt: now });
      }
      if (fresh.length) setItems((prev) => [...fresh, ...prev]);
      return fresh.length;
    },
    [items]
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<Pick<OwnedItem, 'label' | 'brand'>>) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          const next = { ...i, ...patch };
          if (!next.brand?.trim()) delete next.brand;
          return next;
        })
      );
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const addFollow = useCallback((f: Follow) => {
    setFollows((prev) => [
      f,
      ...prev.filter((p) => p.brand.toLowerCase() !== f.brand.toLowerCase()),
    ]);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      loaded,
      items,
      addItems,
      updateItem,
      removeItem,
      follows,
      addFollow,
      lastEmail: follows[0]?.email ?? '',
      results,
      setResults,
    }),
    [loaded, items, addItems, updateItem, removeItem, follows, addFollow, results]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
