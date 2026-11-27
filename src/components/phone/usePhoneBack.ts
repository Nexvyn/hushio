import { useEffect } from "react";
import { listenBackButton, exitApp, setBackGestureEnabled } from "../../lib/bridge";
import { EXIT_WINDOW_MS, hasBackTarget, nextArmedAt, resolveBack } from "../../lib/phoneBack";
import { useNavigation } from "../../stores/navigation";
import { usePlaylistEdit } from "../../stores/playlistEdit";
import { useSongInfo } from "../../stores/songInfo";
import { useUI } from "../../stores/ui";
import { closeTopSheet, isSheetOpen } from "./phoneOverlays";

function backTargetOpen(): boolean {
  const ui = useUI.getState();
  const nav = useNavigation.getState();
  return hasBackTarget({
    searchFocused: ui.searchFocused,
    sheetOpen: isSheetOpen(),
    nowPlayingOpen: ui.nowPlayingOpen,
    canGoBack: nav.navPast.length > 0,
    atHome: nav.view.name === "home",
  });
}

export function usePhoneBack(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let sent: boolean | null = null;
    const syncGesture = () => {
      const next = backTargetOpen();
      if (next === sent) return;
      sent = next;
      setBackGestureEnabled(next).catch(() => {});
    };
    syncGesture();
    const unsubscribes = [
      useUI.subscribe(syncGesture),
      useNavigation.subscribe(syncGesture),
      useSongInfo.subscribe(syncGesture),
      usePlaylistEdit.subscribe(syncGesture),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let armedAt: number | null = null;
    let unlisten: (() => void) | null = null;
    let disposed = false;

    const onBack = () => {
      const ui = useUI.getState();
      if (ui.searchFocused) {
        document.getElementById("phone-search")?.blur();
        return;
      }
      const nav = useNavigation.getState();
      const now = Date.now();
      const action = resolveBack({
        sheetOpen: isSheetOpen(),
        nowPlayingOpen: ui.nowPlayingOpen,
        canGoBack: nav.navPast.length > 0,
        atHome: nav.view.name === "home",
        armedAt,
        now,
      });
      armedAt = nextArmedAt(action, now);
      switch (action) {
        case "close-sheet":
          closeTopSheet();
          break;
        case "close-now-playing":
          ui.closeNowPlaying();
          break;
        case "history-back":
          nav.goBack();
          break;
        case "go-home":
          nav.navigate({ name: "home" });
          break;
        case "arm-exit":
          ui.toast("Press back again to exit", "info", EXIT_WINDOW_MS);
          break;
        case "exit":
          exitApp().catch(() => {});
          break;
      }
    };

    listenBackButton(onBack)
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
