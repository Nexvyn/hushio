import { listenMenuCommands, setTrayPlaying } from "./bridge";
import { usePlayer } from "../stores/player";

export function routeMenuCommand(command: string): void {
  const player = usePlayer.getState();
  switch (command) {
    case "play-pause":
      player.toggle();
      return;
    case "pause":
      if (player.playing) player.toggle();
      return;
    case "next":
      player.next(true);
      return;
    case "previous":
      player.prev();
      return;
  }
}

export function startMenuCommands(): () => void {
  let stop: (() => void) | undefined;
  let live = true;
  void listenMenuCommands(routeMenuCommand)
    .then((unlisten) => {
      if (live) stop = unlisten;
      else unlisten();
    })
    .catch(() => {});

  const syncTray = (playing: boolean) => {
    void setTrayPlaying(playing).catch(() => {});
  };
  syncTray(usePlayer.getState().playing);
  const unsubscribe = usePlayer.subscribe((state, previous) => {
    if (state.playing !== previous.playing) syncTray(state.playing);
  });

  return () => {
    live = false;
    stop?.();
    unsubscribe();
  };
}
