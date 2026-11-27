import { useEffect, useState } from "react";
import { listenNativeTabBar, playerTabBarSet } from "../../lib/bridge";
import { t, useT } from "../../lib/i18n";
import { reducedMotion } from "../../lib/motion";
import { TABS, type TabId } from "../../lib/phoneNav";
import { useNavigation } from "../../stores/navigation";
import { currentTrack, usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";
import { focusPhoneSearch } from "./focusPhoneSearch";
import { useSheetOpen } from "./phoneOverlays";

const SEPARATOR = "\u0000";

function toHex(triplet: string): string {
  const parts = triplet.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) return "#000000";
  return `#${parts.map((value) => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function tokenHex(name: string): string {
  return toHex(getComputedStyle(document.documentElement).getPropertyValue(name));
}

export function useNativeTabBar({ enabled, active }: { enabled: boolean; active: TabId | null }): void {
  useT();
  const sheetOpen = useSheetOpen();
  const nowPlayingOpen = useUI((state) => state.nowPlayingOpen);
  const searchFocused = useUI((state) => state.searchFocused);
  const visible = !(sheetOpen || nowPlayingOpen || searchFocused);
  const rounded = usePlayer(currentTrack) === null;
  const labelKey = TABS.map((tab) => t(tab.labelKey)).join(SEPARATOR);
  const navigate = useNavigation((state) => state.navigate);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const bump = () => setThemeVersion((version) => version + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    media.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", bump);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void playerTabBarSet({
      active,
      visible,
      rounded,
      surface: tokenHex("--surface"),
      ink1: tokenHex("--ink-1"),
      ink2: tokenHex("--ink-2"),
      labels: labelKey.split(SEPARATOR),
    }).catch(() => {});
  }, [enabled, active, visible, rounded, labelKey, themeVersion]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let stop: (() => void) | undefined;
    void listenNativeTabBar({
      onPress: ({ id, again }) => {
        const tab = TABS.find((item) => item.id === id);
        if (!tab) return;
        navigate(tab.view);
        if (again) {
          document.getElementById("view-scroll")?.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
        }
      },
      onLongPress: () => {
        const search = TABS.find((tab) => tab.id === "search");
        if (search) navigate(search.view);
        focusPhoneSearch();
      },
    })
      .then((unlisten) => {
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, [enabled, navigate]);
}
