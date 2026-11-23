import type { View } from "../stores/navigation";
import type { TKey } from "./i18n";

export type TabId = "home" | "search" | "library" | "hotlist";

export const TABS: readonly { id: TabId; labelKey: TKey; view: View }[] = [
  { id: "home", labelKey: "tab.home", view: { name: "home" } },
  { id: "search", labelKey: "tab.search", view: { name: "search" } },
  { id: "library", labelKey: "tab.library", view: { name: "library" } },
  { id: "hotlist", labelKey: "tab.hotlist", view: { name: "charts" } },
];

export const TAB_BAR_DP = 64;
export const MINI_PLAYER_DP = 64;
const MINI_GAP_DP = 12;
export const INSET_BOTTOM = "var(--inset-bottom, env(safe-area-inset-bottom, 0px))";
export const INSET_TOP = "var(--inset-top, env(safe-area-inset-top, 0px))";

export function phoneBottomBlock(miniShown: boolean): string {
  const dp = TAB_BAR_DP + (miniShown ? MINI_PLAYER_DP : 0) + MINI_GAP_DP;
  return `calc(${dp}px + ${INSET_BOTTOM})`;
}

export function phoneBottomPad(miniShown: boolean): string {
  const dp = TAB_BAR_DP + (miniShown ? MINI_PLAYER_DP : 0) + MINI_GAP_DP + 16;
  return `calc(${dp}px + ${INSET_BOTTOM})`;
}

export function tabOfRoot(view: View): TabId | null {
  if (view.param) return null;
  return TABS.find((tab) => tab.view.name === view.name)?.id ?? null;
}

export function isTabRoot(view: View): boolean {
  return tabOfRoot(view) !== null;
}

export function tabRoot(tab: TabId): View {
  return (TABS.find((item) => item.id === tab) ?? TABS[0]).view;
}
