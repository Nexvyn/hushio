import { create } from "zustand";
import { PODCASTS_ENABLED } from "../lib/features";

export type ViewName =
  | "home"
  | "explore"
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
  | "downloads"
  | "local"
  | "listen"
  | "podcast"
  | "podcasts"
  | "mood"
  | "smart"
  | "duplicates"
  | "settings";

export type View = { name: ViewName; param?: string };

export type NavEntry = { view: View; scroll: number };

const HISTORY_LIMIT = 40;

function readViewScroll() {
  if (typeof document === "undefined") return 0;
  return document.getElementById("view-scroll")?.scrollTop ?? 0;
}

function gateView(view: View): View {
  if (PODCASTS_ENABLED) return view;
  return view.name === "podcast" || view.name === "podcasts" ? { name: "home" } : view;
}

function sameView(a: View, b: View) {
  return a.name === b.name && a.param === b.param;
}

type NavigationState = {
  view: View;
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
  navPast: [],
  navFuture: [],
  pendingScroll: null,
  viewReloadNonce: 0,

  navigate: (requested) =>
    set((state) => {
      const next = gateView(requested);
      if (sameView(state.view, next)) return state;
      return {
        view: next,
        navPast: [...state.navPast, { view: state.view, scroll: readViewScroll() }].slice(
          -HISTORY_LIMIT,
        ),
        navFuture: [],
        pendingScroll: 0,
      };
    }),

  replaceView: (requested) =>
    set((state) => {
      const next = gateView(requested);
      return sameView(state.view, next) ? state : { view: next };
    }),

  goBack: () =>
    set((state) => {
      const previous = state.navPast.at(-1);
      if (!previous) return state;
      return {
        view: previous.view,
        navPast: state.navPast.slice(0, -1),
        navFuture: [
          { view: state.view, scroll: readViewScroll() },
          ...state.navFuture,
        ].slice(0, HISTORY_LIMIT),
        pendingScroll: previous.scroll,
      };
    }),

  goForward: () =>
    set((state) => {
      const next = state.navFuture[0];
      if (!next) return state;
      return {
        view: next.view,
        navPast: [...state.navPast, { view: state.view, scroll: readViewScroll() }].slice(
          -HISTORY_LIMIT,
        ),
        navFuture: state.navFuture.slice(1),
        pendingScroll: next.scroll,
      };
    }),

  clearPendingScroll: () => set({ pendingScroll: null }),
}));
