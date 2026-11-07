import { useEffect } from "react";
import { focusSearch } from "./shortcuts";
import { listenMenuCommands, menuSetPlaybackState, platform, type MenuPlaybackState } from "./bridge";
import { dispatchMenuCommand, historyCommand, type MenuDeps } from "./menuCommands";
import { formatSleepLeft } from "./sleepTimer";
import { startFor, startAtSongEnd } from "./sleepActions";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useSleepTimer } from "../stores/sleepTimer";
import { useUI } from "../stores/ui";

function storeDeps(): MenuDeps {
  return {
    toggle: () => usePlayer.getState().toggle(),
    pause: () => {
      if (usePlayer.getState().playing) usePlayer.getState().toggle();
    },
    next: () => usePlayer.getState().next(true),
    previous: () => usePlayer.getState().prev(),
    toggleShuffle: () => usePlayer.getState().toggleShuffle(),
    setRepeat: (mode) => usePlayer.setState({ repeat: mode }),
    sleep: (minutes) => startFor(minutes, formatSleepLeft(minutes * 60_000)),
    sleepAtSongEnd: () => startAtSongEnd(),
    cancelSleep: () => useSleepTimer.getState().cancel(),
    toggleQueue: () => useUI.getState().toggleQueue(),
    toggleLyrics: () => useUI.getState().toggleLyrics(),
    toggleNowPlaying: () => useUI.getState().toggleNowPlaying(),
    openSettings: () => useNavigation.getState().navigate({ name: "settings" }),
    focusSearch,
    goBack: () => useNavigation.getState().goBack(),
    goForward: () => useNavigation.getState().goForward(),
    layered: () => {
      const ui = useUI.getState();
      return Boolean(ui.dialog || ui.contextMenu || ui.playlistPicker);
    },
  };
}

function playbackSnapshot(): MenuPlaybackState {
  const { playing, shuffle, repeat } = usePlayer.getState();
  return { playing, shuffle, repeat };
}

export function useMenuCommands() {
  useEffect(() => {
    const deps = storeDeps();
    let live = true;
    let unlisten: (() => void) | undefined;

    void listenMenuCommands((command) => {
      dispatchMenuCommand(command, deps);
    }).then((stop) => {
      if (live) unlisten = stop;
      else stop();
    });

    return () => {
      live = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (platform !== "macos") return;
    const deps = storeDeps();

    void menuSetPlaybackState(playbackSnapshot());
    const unsubscribe = usePlayer.subscribe((state, previous) => {
      if (
        state.playing === previous.playing &&
        state.shuffle === previous.shuffle &&
        state.repeat === previous.repeat
      ) {
        return;
      }
      void menuSetPlaybackState(playbackSnapshot());
    });

    function onKeyDown(event: KeyboardEvent) {
      const command = historyCommand(event);
      if (!command || deps.layered()) return;
      event.preventDefault();
      dispatchMenuCommand(command, deps);
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
