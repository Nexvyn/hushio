import { APP_NAME } from "./app";
import { upgradeArtwork } from "./artwork";
import {
  clearMedia,
  listenMediaButton,
  listenMediaSeek,
  type MediaButton,
  type MediaTrackPayload,
  setMediaPlaying,
  setMediaPosition,
  setMediaTrack,
} from "./bridge";
import { createMediaKeyTap } from "./mediaSession";
import { currentTrack, type PlayerState, usePlayer } from "../stores/player";
import type { Track } from "../types";

const COVER_SIZE = 1200;
const POSITION_MIN_DELTA_S = 0.75;
const PAGE_SESSION_ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "previoustrack",
  "nexttrack",
  "seekbackward",
  "seekforward",
  "seekto",
];

type Shown = {
  id: string;
  duration: number;
  playing: boolean | null;
  position: number;
};

export function trackPayload(track: Track, duration: number): MediaTrackPayload {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: APP_NAME,
    thumb: upgradeArtwork(track.thumb, COVER_SIZE) || null,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
  };
}

function ignore(): void {}

export function startSmtc(): () => void {
  const tap = createMediaKeyTap({
    single: (key) => {
      const { playing, toggle } = usePlayer.getState();
      if ((key === "play" && !playing) || (key === "pause" && playing)) toggle();
    },
    multi: () => usePlayer.getState().next(true),
  });

  const handleButton = (action: MediaButton) => {
    const player = usePlayer.getState();
    if (action === "play") tap.press("play");
    else if (action === "pause") tap.press("pause");
    else if (action === "next") {
      tap.cancelPending();
      player.next(true);
    } else {
      tap.cancelPending();
      player.prev();
    }
  };

  const handleSeek = (seconds: number) => {
    tap.cancelPending();
    usePlayer.getState().seek(seconds);
  };

  const session = "mediaSession" in navigator ? navigator.mediaSession : null;
  for (const action of PAGE_SESSION_ACTIONS) {
    try {
      session?.setActionHandler(action, ignore);
    } catch {
      ignore();
    }
  }

  let shown: Shown | null = null;

  const sync = (state: PlayerState) => {
    const track = currentTrack(state);
    if (!track) {
      if (shown) {
        shown = null;
        void clearMedia().catch(ignore);
      }
      return;
    }
    const duration = Number.isFinite(state.duration) && state.duration > 0 ? state.duration : 0;
    if (!shown || shown.id !== track.id || shown.duration !== duration) {
      shown = { id: track.id, duration, playing: null, position: Number.NEGATIVE_INFINITY };
      void setMediaTrack(trackPayload(track, duration)).catch(ignore);
    }
    if (shown.playing !== state.playing) {
      shown.playing = state.playing;
      void setMediaPlaying(state.playing).catch(ignore);
    }
    if (duration > 0 && Math.abs(state.position - shown.position) >= POSITION_MIN_DELTA_S) {
      shown.position = state.position;
      void setMediaPosition(state.position, duration).catch(ignore);
    }
  };

  const listeners = Promise.all([listenMediaButton(handleButton), listenMediaSeek(handleSeek)]).catch(
    () => [] as (() => void)[],
  );
  const unsubscribe = usePlayer.subscribe(sync);
  sync(usePlayer.getState());

  return () => {
    unsubscribe();
    tap.cancelPending();
    void listeners.then((stops) => stops.forEach((stop) => stop()));
    for (const action of PAGE_SESSION_ACTIONS) {
      try {
        session?.setActionHandler(action, null);
      } catch {
        ignore();
      }
    }
  };
}
