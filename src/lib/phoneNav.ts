import type { View, ViewName } from "../stores/navigation";

export type TabId = "home" | "search" | "library";

export const TABS: readonly { id: TabId; label: string; view: View }[] = [
  { id: "home", label: "Home", view: { name: "home" } },
  { id: "search", label: "Search", view: { name: "search" } },
  { id: "library", label: "Library", view: { name: "library" } },
];

export const TAB_BAR_DP = 56;
export const MINI_PLAYER_DP = 56;
export const MINI_GAP_DP = 8;
export const INSET_BOTTOM = "var(--inset-bottom, env(safe-area-inset-bottom, 0px))";
export const INSET_TOP = "var(--inset-top, env(safe-area-inset-top, 0px))";

const TAB_OF: Record<ViewName, TabId> = {
  home: "home",
  explore: "home",
  charts: "home",
  newreleases: "home",
  podcasts: "home",
  podcast: "home",
  mood: "home",
  search: "search",
  library: "library",
  playlists: "library",
  playlist: "library",
  folder: "library",
  ytplaylist: "library",
  smart: "library",
  duplicates: "library",
  import: "library",
  album: "library",
  artist: "library",
  local: "library",
  listen: "library",
  downloads: "library",
  settings: "home",
};

export function tabFor(view: View): TabId {
  return TAB_OF[view.name];
}

export function phoneToastBottom(miniShown: boolean): string {
  const dp = TAB_BAR_DP + MINI_GAP_DP + (miniShown ? MINI_PLAYER_DP + MINI_GAP_DP : 0);
  return `calc(${dp}px + ${INSET_BOTTOM})`;
}

const MINI_BLOCK_DP = MINI_PLAYER_DP + 2 * MINI_GAP_DP;

export function phoneBottomBlock(miniShown: boolean): string {
  const dp = TAB_BAR_DP + (miniShown ? MINI_BLOCK_DP : 0);
  return `calc(${dp}px + ${INSET_BOTTOM})`;
}

export function phoneBottomPad(miniShown: boolean): string {
  return `${(miniShown ? MINI_BLOCK_DP : 0) + 16}px`;
}

export function isTabRoot(view: View): boolean {
  return TABS.some((tab) => tab.view.name === view.name);
}

export function tabRootFor(view: View): View {
  return (TABS.find((tab) => tab.id === tabFor(view)) ?? TABS[0]).view;
}
