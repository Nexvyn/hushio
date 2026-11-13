import { castLoad, castOpen, castStatus } from "./bridge";
import { resolveStream } from "./resolveStream";
import { currentTrack, usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

export async function castNowPlaying(): Promise<"connected" | "choose" | "idle"> {
  const state = usePlayer.getState();
  const track = currentTrack(state);
  if (!track) return "idle";
  const status = await castStatus();
  if (!status.connected) {
    await castOpen();
    return "choose";
  }
  const stream = await resolveStream(track.id);
  await castLoad({
    url: stream.url,
    title: track.title,
    artist: track.artist,
    artworkUrl: track.thumb,
    positionMs: Math.round(state.position * 1000),
    playing: state.playing,
  });
  return "connected";
}

export async function castFromNowPlaying(): Promise<void> {
  try {
    const result = await castNowPlaying();
    if (result === "choose") useUI.getState().toast("Pick a Cast device, then press Cast again");
    if (result === "connected") useUI.getState().toast("Casting this song");
  } catch (error) {
    useUI.getState().toast(`Couldn't cast this song: ${String(error)}`, "error");
  }
}
