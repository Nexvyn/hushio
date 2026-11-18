import type { HomeItem, HomePage, HomeShelf } from "./home";
import type { RadioPage, Market } from "./innertube";
import type { Track } from "../types";

type DiscoveryShelf = HomeShelf & { id: string };
export type HomeStreamState = { key: string; shelves: DiscoveryShelf[]; loading: boolean; error: string | null; done: boolean };
type Source = {
  browse: (market: Market, token: string) => Promise<HomePage>;
  radio: (id: string) => Promise<RadioPage | null>;
};
const isSeed = (track: Track) => /^[A-Za-z0-9_-]{11}$/.test(track.id) && !track.episode;
const titleKey = (title: string) => title.normalize("NFKC").toLowerCase().trim();
const radioTitle = (seed: Track) => `More like ${seed.title}`;
function homeItemKey(item: HomeItem): string {
  return item.kind === "track" ? `track:${item.track.id}` : `${item.kind}:${item.kind === "playlist" ? item.id.replace(/^VL/, "") : item.id}`;
}
export function freshHomeShelves(shelves: readonly HomeShelf[], seen: Set<string>): HomeShelf[] {
  return shelves.flatMap(shelf => {
    const items = shelf.items.filter(item => {
      const key = homeItemKey(item);
      const recording = item.kind === "track" && item.track.title && item.track.artist
        ? `recording:${item.track.title.normalize("NFKC").toLowerCase().trim()}|${item.track.artist.normalize("NFKC").toLowerCase().trim()}` : null;
      if (seen.has(key) || (recording && seen.has(recording))) return false;
      if (recording) seen.add(recording);
      seen.add(key); return true;
    });
    return items.length ? [{ ...shelf, items }] : [];
  });
}
function takeNewTitles(shelves: HomeShelf[], titles: Set<string>): HomeShelf[] {
  return shelves.filter(shelf => {
    const key = titleKey(shelf.title);
    if (titles.has(key)) return false;
    titles.add(key);
    return true;
  });
}

export function createHomeStream(source: Source) {
  let state: HomeStreamState = { key: "", shelves: [], loading: false, error: null, done: false };
  const listeners = new Set<() => void>();
  let generation = 0;
  let market: Market = { location: "US", lang: "en" };
  let cursor: string | null = null;
  let sequence = 0;
  let seeds: Track[] = [];
  let seen = new Set<string>();
  let titles = new Set<string>();
  let requested = new Set<string>();
  let queued = new Set<string>();
  const update = (patch: Partial<HomeStreamState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const nextSeed = (): Track | null => {
    while (seeds.length) {
      const seed = seeds.shift()!;
      if (!titles.has(titleKey(radioTitle(seed)))) return seed;
    }
    return null;
  };
  const addSeeds = (tracks: readonly Track[]) => {
    for (const track of tracks) if (isSeed(track) && !queued.has(track.id) && seeds.length < 500) {
      queued.add(track.id); seeds.push(track);
    }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure: (key: string, region: Market, initial: readonly HomeShelf[], continuation: string | null, tracks: readonly Track[]) => {
      if (state.key !== key) {
        generation++; market = region; cursor = continuation; sequence = 0;
        seen = new Set(); titles = new Set(); requested = new Set(); queued = new Set(); seeds = [];
        freshHomeShelves(initial, seen);
        addSeeds(tracks);
        addSeeds(initial.flatMap(shelf => shelf.items.flatMap(item => item.kind === "track" ? [item.track] : [])));
        update({ key, shelves: [], loading: false, error: null, done: !cursor && seeds.length === 0 });
      }
      for (const shelf of initial) {
        titles.add(titleKey(shelf.title));
        for (const item of shelf.items) seen.add(homeItemKey(item));
      }
      addSeeds(tracks);
      if (state.done && (cursor || seeds.length)) update({ done: false });
    },
    loadMore: async () => {
      if (state.loading || state.done || !state.key) return;
      const run = generation;
      update({ loading: true, error: null });
      try {
        for (let empty = 0; empty < 3; empty++) {
          let incoming: HomeShelf[];
          if (cursor) {
            const token = cursor;
            const page = await source.browse(market, token);
            if (run !== generation) return;
            requested.add(`browse:${token}`);
            cursor = page.continuation && !requested.has(`browse:${page.continuation}`) ? page.continuation : null;
            incoming = page.shelves;
          } else {
            const seed = nextSeed();
            if (!seed) { update({ loading: false, done: true }); return; }
            const page = await source.radio(seed.id);
            if (run !== generation) return;
            incoming = [{ title: radioTitle(seed), items: (page?.items ?? []).filter(track => track.videoType === "song" && !track.episode).map(track => ({ kind: "track" as const, track })) }];
          }
          const fresh = freshHomeShelves(takeNewTitles(incoming, titles), seen);
          if (fresh.length) {
            addSeeds(fresh.flatMap(shelf => shelf.items.flatMap(item => item.kind === "track" ? [item.track] : [])));
            const shelves = fresh.map(shelf => ({ ...shelf, id: `discovery-${++sequence}` }));
            update({ shelves: [...state.shelves, ...shelves], loading: false });
            return;
          }
        }
        update({ loading: false, error: "No fresh recommendations came through. Try loading more." });
      } catch {
        if (run === generation) update({ loading: false, error: "Couldn't load more music. Your feed is still here; try again." });
      }
    },
  };
}
