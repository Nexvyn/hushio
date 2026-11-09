import { useEffect } from "react";
import { listenBackButton, exitApp } from "../../lib/bridge";
import { EXIT_WINDOW_MS, nextArmedAt, resolveBack } from "../../lib/phoneBack";
import { useNavigation } from "../../stores/navigation";
import { useUI } from "../../stores/ui";

export function usePhoneBack() {
  useEffect(() => {
    let armedAt: number | null = null;
    let unlisten: (() => void) | null = null;
    let disposed = false;

    const onBack = () => {
      const ui = useUI.getState();
      const nav = useNavigation.getState();
      const now = Date.now();
      const sheetOpen =
        ui.contextMenu !== null || ui.dialog !== null || ui.playlistPicker !== null || ui.phoneQueueOpen;
      const action = resolveBack({
        sheetOpen,
        nowPlayingOpen: ui.nowPlayingOpen,
        canGoBack: nav.navPast.length > 0,
        atHome: nav.view.name === "home",
        armedAt,
        now,
      });
      armedAt = nextArmedAt(action, now);
      switch (action) {
        case "close-sheet":
          if (ui.contextMenu) ui.closeContextMenu();
          else if (ui.dialog) ui.closeDialog();
          else if (ui.playlistPicker) ui.closePlaylistPicker();
          else ui.closePhoneQueue();
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
