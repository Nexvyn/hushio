import type { SearchSong } from "./searchParse";
import { currentTrack, usePlayer } from "../stores/player";

export function useBrowsePlayback(tracks: SearchSong[], from?: string) {
  const playQueue = usePlayer((state) => state.playQueue);
  const current = usePlayer((state) => currentTrack(state)?.id);
  const playing = usePlayer((state) => state.playing);

  const playAt = (index: number) => playQueue(tracks, index, from);
  const shuffle = () => {
    usePlayer.setState({ shuffle: true });
    playQueue(tracks, Math.floor(Math.random() * tracks.length), from);
  };

  return { current, playing, playAt, shuffle };
}
