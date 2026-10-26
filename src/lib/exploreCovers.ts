import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { artworkUrlOk } from "./artwork";
import { persistStorage } from "./persist";

const FRESH_MS = 7 * 24 * 3_600_000;
const KEEP = 200;
const AT_ONCE = 3;

type CoverEntry = { covers: string[]; at: number };

type CoversState = {
  byKey: Record<string, CoverEntry>;
  put: (key: string, covers: string[]) => void;
  drop: (key: string) => void;
};

function keepNewest(byKey: Record<string, CoverEntry>): Record<string, CoverEntry> {
  return Object.fromEntries(
    Object.entries(byKey)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, KEEP),
  );
}

export const useExploreCovers = create<CoversState>()(
  persist(
    (set) => ({
      byKey: {},
      put: (key, covers) =>
        set((state) => ({ byKey: keepNewest({ ...state.byKey, [key]: { covers, at: Date.now() } }) })),
      drop: (key) =>
        set((state) => ({
          byKey: Object.fromEntries(Object.entries(state.byKey).filter(([name]) => name !== key)),
        })),
    }),
    {
      name: "explore-covers",
      storage: persistStorage<Pick<CoversState, "byKey">>("explore-covers"),
      partialize: (state) => ({ byKey: state.byKey }),
    },
  ),
);

const asking = new Set<string>();
const reasked = new Set<string>();
const waiting: (() => Promise<void>)[] = [];
let running = 0;

function pump(): void {
  while (running < AT_ONCE) {
    const task = waiting.shift();
    if (!task) return;
    running++;
    void task().finally(() => {
      running--;
      pump();
    });
  }
}

function askFor(key: string, load: () => Promise<string[]>): void {
  asking.add(key);
  waiting.push(() =>
    load()
      .then(
        (covers) => {
          const valid = covers.filter(artworkUrlOk);
          if (valid.length > 0) useExploreCovers.getState().put(key, valid);
        },
        () => undefined,
      )
      .finally(() => asking.delete(key)),
  );
  pump();
}

export function useCovers<T extends HTMLElement>(key: string | null, load: () => Promise<string[]>) {
  const ref = useRef<T>(null);
  const loader = useRef(load);
  loader.current = load;
  const entry = useExploreCovers((state) => (key ? state.byKey[key] : undefined));
  const [hydrated, setHydrated] = useState(() => useExploreCovers.persist.hasHydrated());

  useEffect(() => useExploreCovers.persist.onFinishHydration(() => setHydrated(true)), []);

  const fresh = entry !== undefined && Date.now() - entry.at < FRESH_MS;

  useEffect(() => {
    const node = ref.current;
    if (!key || !hydrated || fresh || !node) return;
    const id = key;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((item) => item.isIntersecting)) return;
      observer.disconnect();
      if (!asking.has(id)) askFor(id, () => loader.current());
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [key, hydrated, fresh]);

  const markBroken = () => {
    if (!key || reasked.has(key)) return;
    reasked.add(key);
    useExploreCovers.getState().drop(key);
  };

  return { ref, covers: entry?.covers ?? null, markBroken };
}
