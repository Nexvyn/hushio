import { create } from "zustand";
import { useUI } from "./ui";
import type { SearchFilter } from "../lib/searchParse";
import { tabOfRoot, type TabId } from "../lib/phoneNav";

export type ViewName =
  | "home"
  | "charts"
  | "newreleases"
  | "search"
  | "library"
  | "playlists"
  | "playlist"
  | "folder"
  | "ytplaylist"
  | "import"
  | "album"
  | "artist"
  | "discography"
  | "downloads"
  | "local"
  | "daylist"
  | "replay"
  | "history"
  | "settings";

export type View = { name: ViewName; param?: string };

type SearchSnapshot = { query: string; filter: SearchFilter };
export type NavEntry = { view: View; tab?: TabId; scroll: number; search?: SearchSnapshot };

function snapshot(view: View, tab: TabId, committed: SearchSnapshot | null, useCommitted = false): NavEntry {
  const ui = useUI.getState();
  return {
    view,
    tab,
    scroll: readViewScroll(),
    ...(view.name === "search" ? {
      search: { query: useCommitted ? committed?.query ?? ui.searchQuery : ui.searchQuery, filter: ui.searchFilter },
    } : {}),
  };
}

function restoreSearch(entry: NavEntry) {
  if (entry.search) useUI.setState({ searchQuery: entry.search.query, searchFilter: entry.search.filter });
}

const HISTORY_LIMIT = 40;

function readViewScroll() {
  if (typeof document === "undefined") return 0;
  return document.getElementById("view-scroll")?.scrollTop ?? 0;
}

function sameView(a: View, b: View) {
  return a.name === b.name && a.param === b.param;
}

type NavigationState = {
  view: View;
  tab: TabId;
  committedSearch: SearchSnapshot | null;
  submitSearch: (query: string) => void;
  navPast: NavEntry[];
  navFuture: NavEntry[];
  pendingScroll: number | null;
  viewReloadNonce: number;
  navigate: (view: View) => void;
  replaceView: (view: View) => void;
  goBack: () => void;
  goForward: () => void;
  clearPendingScroll: () => void;
};

export const useNavigation = create<NavigationState>()((set) => ({
  view: { name: "home" },
  tab: "home",
  committedSearch: null,
  submitSearch: (query) => set((state) => {
    const filter = useUI.getState().searchFilter;
    if (state.view.name !== "search") return { committedSearch: { query, filter } };
    if (state.committedSearch?.query === query && state.committedSearch.filter === filter) return state;
    return {
      committedSearch: { query, filter },
      navPast: [...state.navPast, snapshot(state.view, state.tab, state.committedSearch, true)].slice(-HISTORY_LIMIT),
      navFuture: [],
      pendingScroll: 0,
    };
  }),
  navPast: [],
  navFuture: [],
  pendingScroll: null,
  viewReloadNonce: 0,

  navigate: (requested) =>
    set((state) => {
      const next = requested;
      if (sameView(state.view, next)) return state;
      return {
        view: next,
        tab: tabOfRoot(next) ?? state.tab,
        navPast: [...state.navPast, snapshot(state.view, state.tab, state.committedSearch)].slice(
          -HISTORY_LIMIT,
        ),
        navFuture: [],
        pendingScroll: 0,
      };
    }),

  replaceView: (requested) =>
    set((state) => {
      const next = requested;
      return sameView(state.view, next) ? state : { view: next, tab: tabOfRoot(next) ?? state.tab };
    }),

  goBack: () =>
    set((state) => {
      const previous = state.navPast.at(-1);
      if (!previous) return state;
      const current = snapshot(state.view, state.tab, state.committedSearch);
      restoreSearch(previous);
      return {
        committedSearch: previous.search ?? state.committedSearch,
        view: previous.view,
        tab: previous.tab ?? state.tab,
        navPast: state.navPast.slice(0, -1),
        navFuture: [
          current,
          ...state.navFuture,
        ].slice(0, HISTORY_LIMIT),
        pendingScroll: previous.scroll,
      };
    }),

  goForward: () =>
    set((state) => {
      const next = state.navFuture[0];
      if (!next) return state;
      const current = snapshot(state.view, state.tab, state.committedSearch);
      restoreSearch(next);
      return {
        committedSearch: next.search ?? state.committedSearch,
        view: next.view,
        tab: next.tab ?? state.tab,
        navPast: [...state.navPast, current].slice(
          -HISTORY_LIMIT,
        ),
        navFuture: state.navFuture.slice(1),
        pendingScroll: next.scroll,
      };
    }),

  clearPendingScroll: () => set({ pendingScroll: null }),
}));
