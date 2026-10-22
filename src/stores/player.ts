import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import {
  audio,
  pause as pauseAudio,
  play as playAudio,
  playStream,
  seekTo,
  setMuted,
  setVolume as setAudioVolume,
} from "../lib/audio";
import { persistStorage } from "../lib/persist";
import {
  advance,
  insertIds,
  inYourOrder,
  orderFrom,
  randomSeed,
  type RepeatMode,
  seededShuffle,
  shuffleUpcoming,
} from "../lib/queue";
import type { Track } from "../types";
import { useUI } from "./ui";

export type { RepeatMode };

const HISTORY_LIMIT = 200;
const DEFAULT_VOLUME = 0.8;
const RESTART_AFTER_S = 3;
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

type PlayerValues = {
  queue: Track[];
  index: number;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  unshuffled: string[] | null;
  playingFrom: string | null;
  history: Track[];
};

type PlayerPersisted = Pick<
  PlayerValues,
  "queue" | "index" | "volume" | "muted" | "shuffle" | "repeat" | "unshuffled" | "playingFrom" | "history"
>;

export type PlayerState = PlayerValues & {
  playQueue: (tracks: Track[], startIndex?: number, from?: string) => void;
  playTrack: (track: Track) => void;
  jumpTo: (index: number) => void;
  addToQueue: (tracks: Track[], playNext?: boolean) => number;
  removeAt: (index: number) => void;
  clearUpcoming: () => void;
  next: (manual?: boolean) => void;
  prev: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  handleEnded: () => void;
};

let loadedId: string | null = null;

function load(track: Track) {
  loadedId = track.id;
  usePlayer.setState({ duration: 0 });
  playStream(track.id, track.title).catch(() => {
    usePlayer.setState({ playing: false, buffering: false });
    useUI.getState().toast(`Couldn't play "${track.title}"`, "error");
  });
}

function startCurrent() {
  const { queue, index, history } = usePlayer.getState();
  const track = queue[index];
  if (!track) return;
  usePlayer.setState({
    playing: true,
    position: 0,
    history: [track, ...history.filter((item) => item.id !== track.id)].slice(0, HISTORY_LIMIT),
  });
  load(track);
}

const saved = persistStorage<PlayerPersisted>("player");
let lastSaved = "";

const storage: PersistStorage<PlayerPersisted> = {
  getItem: saved.getItem,
  setItem: (name, value) => {
    const json = JSON.stringify(value);
    if (json === lastSaved) return;
    lastSaved = json;
    return saved.setItem(name, value);
  },
  removeItem: saved.removeItem,
};

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: 0,
      playing: false,
      buffering: false,
      position: 0,
      duration: 0,
      volume: DEFAULT_VOLUME,
      muted: false,
      shuffle: false,
      repeat: "off",
      unshuffled: null,
      playingFrom: null,
      history: [],

      playQueue: (tracks, startIndex = 0, from) => {
        if (tracks.length === 0) return;
        const start = Math.min(Math.max(startIndex, 0), tracks.length - 1);
        const { shuffle } = get();
        const queue = shuffle
          ? [tracks[start], ...seededShuffle([...tracks.slice(0, start), ...tracks.slice(start + 1)], randomSeed())]
          : [...tracks];
        set({
          queue,
          index: shuffle ? 0 : start,
          unshuffled: shuffle ? orderFrom(tracks, start) : null,
          playingFrom: from ?? null,
        });
        startCurrent();
      },

      playTrack: (track) => {
        const { queue, index, shuffle, unshuffled } = get();
        const at = queue.findIndex((item, i) => i >= index && item.id === track.id);
        if (at >= 0) {
          set({ index: at, playingFrom: null });
        } else {
          const insertAt = queue.length === 0 ? 0 : index + 1;
          set({
            queue: [...queue.slice(0, insertAt), track, ...queue.slice(insertAt)],
            index: insertAt,
            unshuffled:
              shuffle && unshuffled ? insertIds(unshuffled, [track.id], queue[index]?.id) : unshuffled,
            playingFrom: null,
          });
        }
        startCurrent();
      },

      jumpTo: (target) => {
        if (target < 0 || target >= get().queue.length) return;
        set({ index: target });
        startCurrent();
      },

      addToQueue: (tracks, playNext = false) => {
        const unique = tracks.filter((track, i) => tracks.findIndex((item) => item.id === track.id) === i);
        if (unique.length === 0) return 0;
        const { queue, index, shuffle, unshuffled } = get();

        if (queue.length === 0) {
          set({
            queue: unique,
            index: 0,
            playing: false,
            unshuffled: shuffle ? unique.map((track) => track.id) : null,
          });
          return unique.length;
        }

        const upcoming = new Set(queue.slice(index + 1).map((track) => track.id));
        const add = unique.filter((track) => !upcoming.has(track.id));
        if (add.length === 0) return 0;
        const ids = add.map((track) => track.id);

        if (playNext) {
          set({
            queue: [...queue.slice(0, index + 1), ...add, ...queue.slice(index + 1)],
            unshuffled:
              shuffle && unshuffled ? insertIds(unshuffled, ids, queue[index]?.id) : unshuffled,
          });
        } else {
          set({
            queue: [...queue, ...add],
            unshuffled: shuffle && unshuffled ? insertIds(unshuffled, ids, undefined) : unshuffled,
          });
        }
        return add.length;
      },

      removeAt: (target) => {
        const { queue, index, playing, unshuffled } = get();
        if (target < 0 || target >= queue.length) return;
        const remaining = queue.filter((_, i) => i !== target);
        const removedId = queue[target].id;
        const nextUnshuffled = unshuffled?.filter((id) => id !== removedId) ?? null;

        if (target !== index) {
          set({ queue: remaining, index: target < index ? index - 1 : index, unshuffled: nextUnshuffled });
          return;
        }

        if (remaining.length === 0) {
          pauseAudio();
          loadedId = null;
          set({ queue: [], index: 0, playing: false, position: 0, unshuffled: nextUnshuffled });
          return;
        }

        set({
          queue: remaining,
          index: Math.min(index, remaining.length - 1),
          position: 0,
          unshuffled: nextUnshuffled,
        });
        if (playing) startCurrent();
      },

      clearUpcoming: () => {
        const { queue, index, unshuffled } = get();
        const kept = queue.slice(0, index + 1);
        const keptIds = new Set(kept.map((track) => track.id));
        set({ queue: kept, unshuffled: unshuffled?.filter((id) => keptIds.has(id)) ?? null });
      },

      next: (manual = false) => {
        const { queue, index, repeat, shuffle } = get();
        if (queue.length === 0) {
          set({ playing: false });
          return;
        }
        const atEnd = index + 1 >= queue.length;
        if (atEnd && repeat !== "all" && !manual) {
          set({ playing: false, position: 0 });
          return;
        }
        const to = advance(queue, index, shuffle);
        set({ queue: to.queue, index: to.index, position: 0 });
        startCurrent();
      },

      prev: () => {
        const { queue, index, position } = get();
        if (position > RESTART_AFTER_S) {
          seekTo(0);
          set({ position: 0 });
          return;
        }
        if (queue.length === 0) return;
        set({ index: index > 0 ? index - 1 : queue.length - 1, position: 0 });
        startCurrent();
      },

      toggle: () => {
        const { queue, index, playing } = get();
        const track = queue[index];
        if (!track) return;
        if (playing) {
          pauseAudio();
          set({ playing: false });
          return;
        }
        if (loadedId === track.id) {
          set({ playing: true });
          void playAudio();
          return;
        }
        startCurrent();
      },

      seek: (seconds) => {
        if (!Number.isFinite(seconds)) return;
        const position = Math.max(0, seconds);
        seekTo(position);
        set({ position });
      },

      setVolume: (value) => {
        if (!Number.isFinite(value)) return;
        const volume = Math.min(1, Math.max(0, value));
        setAudioVolume(volume);
        setMuted(false);
        set({ volume, muted: false });
      },

      toggleMute: () => {
        const muted = !get().muted;
        setMuted(muted);
        set({ muted });
      },

      toggleShuffle: () => {
        const { queue, index, shuffle, unshuffled } = get();
        if (shuffle) {
          set({ shuffle: false, unshuffled: null, queue: inYourOrder(queue, index, unshuffled ?? []) });
          return;
        }
        set({ shuffle: true, unshuffled: orderFrom(queue, index), queue: shuffleUpcoming(queue, index) });
      },

      cycleRepeat: () => set((state) => ({ repeat: NEXT_REPEAT[state.repeat] })),

      handleEnded: () => {
        if (get().repeat === "one") {
          seekTo(0);
          set({ position: 0, playing: true });
          void playAudio();
          return;
        }
        get().next(false);
      },
    }),
    {
      name: "player",
      storage,
      partialize: (state): PlayerPersisted => ({
        queue: state.queue,
        index: state.index,
        volume: state.volume,
        muted: state.muted,
        shuffle: state.shuffle,
        repeat: state.repeat,
        unshuffled: state.unshuffled,
        playingFrom: state.playingFrom,
        history: state.history,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        setAudioVolume(state.volume);
        setMuted(state.muted);
      },
    },
  ),
);

export function currentTrack(state: PlayerState): Track | null {
  return state.queue[state.index] ?? null;
}

export function playFromRow(tracks: Track[], row: number, from?: string) {
  usePlayer.getState().playQueue(tracks, row, from);
}

audio.addEventListener("play", () => usePlayer.setState({ playing: true }));
audio.addEventListener("pause", () => usePlayer.setState({ playing: false }));
audio.addEventListener("playing", () => usePlayer.setState({ playing: true, buffering: false }));
audio.addEventListener("waiting", () => usePlayer.setState({ buffering: true }));
audio.addEventListener("timeupdate", () => usePlayer.setState({ position: audio.currentTime }));
audio.addEventListener("durationchange", () =>
  usePlayer.setState({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
);
audio.addEventListener("ended", () => usePlayer.getState().handleEnded());
