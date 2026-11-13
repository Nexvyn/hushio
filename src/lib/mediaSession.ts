import { APP_NAME } from "./app";
import { audio } from "./audio";
import { upgradeArtwork } from "./artwork";
import { currentTrack, type PlayerState, usePlayer } from "../stores/player";
import type { Track } from "../types";

export const MEDIA_KEY_DOUBLE_TAP_MS = 500;
const SEEK_STEP_S = 10;
const POSITION_TICK_MS = 1000;
const POSITION_MIN_DELTA_S = 0.75;
const ARTWORK_SIZES = [96, 192, 512];

type AbsoluteKey = "play" | "pause";

type TapHandlers = {
  single: (key: AbsoluteKey) => void;
  multi: () => void;
};

export function createMediaKeyTap({ single, multi }: TapHandlers) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let presses = 0;
  let lastKey: AbsoluteKey = "play";

  function cancelPending() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    presses = 0;
  }

  return {
    press(key: AbsoluteKey) {
      lastKey = key;
      presses += 1;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        const count = presses;
        cancelPending();
        if (count === 1) single(lastKey);
        else multi();
      }, MEDIA_KEY_DOUBLE_TAP_MS);
    },
    cancelPending,
  };
}

function metadataFor(track: Track): MediaMetadataInit {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album || APP_NAME,
    artwork: ARTWORK_SIZES.flatMap((size) => {
      const src = upgradeArtwork(track.thumb, size);
      return src ? [{ src, sizes: `${size}x${size}`, type: "image/jpeg" }] : [];
    }),
  };
}

export function startMediaSession(): () => void {
  if (!("mediaSession" in navigator)) return () => {};
  const session = navigator.mediaSession;

  const tap = createMediaKeyTap({
    single: (key) => {
      const { playing, toggle } = usePlayer.getState();
      if ((key === "play" && !playing) || (key === "pause" && playing)) toggle();
    },
    multi: () => usePlayer.getState().next(true),
  });

  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => tap.press("play")],
    ["pause", () => tap.press("pause")],
    [
      "previoustrack",
      () => {
        tap.cancelPending();
        usePlayer.getState().prev();
      },
    ],
    [
      "nexttrack",
      () => {
        tap.cancelPending();
        usePlayer.getState().next(true);
      },
    ],
    [
      "seekbackward",
      () => {
        tap.cancelPending();
        const { position, seek } = usePlayer.getState();
        seek(Math.max(0, position - SEEK_STEP_S));
      },
    ],
    [
      "seekforward",
      () => {
        tap.cancelPending();
        const { position, seek } = usePlayer.getState();
        seek(position + SEEK_STEP_S);
      },
    ],
    [
      "seekto",
      (details) => {
        tap.cancelPending();
        if (details.seekTime != null) usePlayer.getState().seek(details.seekTime);
      },
    ],
  ];

  let shownId: string | null = null;
  let lastPosition = Number.NEGATIVE_INFINITY;

  const sync = (state: PlayerState) => {
    const track = currentTrack(state);
    const id = track?.id ?? null;
    if (id !== shownId) {
      shownId = id;
      lastPosition = Number.NEGATIVE_INFINITY;
      session.metadata = track ? new MediaMetadata(metadataFor(track)) : null;
    }
    session.playbackState = track ? (state.playing ? "playing" : "paused") : "none";
  };

  const syncPosition = () => {
    if (shownId === null) return;
    const { duration, currentTime } = audio;
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (Math.abs(currentTime - lastPosition) < POSITION_MIN_DELTA_S) return;
    lastPosition = currentTime;
    session.setPositionState({
      duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(currentTime, duration),
    });
  };

  for (const [action, handler] of actions) session.setActionHandler(action, handler);
  const unsubscribe = usePlayer.subscribe(sync);
  sync(usePlayer.getState());
  const timer = setInterval(syncPosition, POSITION_TICK_MS);

  return () => {
    clearInterval(timer);
    unsubscribe();
    tap.cancelPending();
    for (const [action] of actions) session.setActionHandler(action, null);
    session.metadata = null;
    session.playbackState = "none";
  };
}
