import { setTrayPlaying } from "./bridge";
import { usePlayer } from "../stores/player";

export function startTraySync(): () => void {
  const sync = (playing: boolean) => {
    void setTrayPlaying(playing).catch(() => {});
  };
  sync(usePlayer.getState().playing);
  const unsubscribe = usePlayer.subscribe((state, previous) => {
    if (state.playing !== previous.playing) sync(state.playing);
  });
  return unsubscribe;
}
