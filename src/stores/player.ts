import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import {
  type BlendEnd,
  type BlendTarget,
  audio,
  pause as pauseAudio,
  play as playAudio,
  playStream,
  seekTo,
  setMuted,
  setVolume as setAudioVolume,
} from "../lib/audio";
import { pauseListen, resumeListen, setListenDuration, startListen, stopListen, tick } from "../lib/listening";
import { prefetchLyrics } from "../lib/lyrics";
import { prefetchAhead } from "../lib/prefetch";
import { thumbArtwork } from "../lib/artwork";
import type { PlayMeta } from "../lib/androidPlayback";
import { persistStorage } from "../lib/persist";
import {
  AUTOPLAY_EMPTY_MESSAGE,
  exclusionsFor,
  type Exclusions,
  fetchRefill,
  fetchSuggestions,
  isRadioSeed,
  LOW_WATER,
  MAX_TAIL,
  RETRY_AFTER_MS,
} from "../lib/autoplay";
import { moveItem } from "../lib/dragReorder";
import { gaplessNextIndex } from "../lib/gapless";
import { queuedEnd } from "../lib/queueInsert";
import {
  hasRecommendationAhead,
  SMART_RETRY_MS,
  withoutUpcomingRecommendations,
  withRecommendation,
} from "../lib/smartShuffle";
import {
  advance,
  hash32,
  insertIds,
  inYourOrder,
  orderFrom,
  randomSeed,
  type RepeatMode,
  seededShuffle,
  shuffleUpcoming,
} from "../lib/queue";
import type { Track } from "../types";
import { useLibrary } from "./library";
import { useSettings } from "./settings";
import { useSleepTimer } from "./sleepTimer";
import { playFailedMessage } from "../lib/playFailed";
import { useUI } from "./ui";

export type { RepeatMode };

const PLAYED_LIMIT = 200;
const HISTORY_KEEP = 100;
const ARTIST_MIX_SIZE = 30;
const DEFAULT_VOLUME = 0.8;
const RESTART_AFTER_S = 3;
const END_SLACK_S = 1;
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

function plainTrack(track: Track): Track {
  return track.queued === undefined && track.suggested === undefined
    ? track
    : { ...track, queued: undefined, suggested: undefined };
}

function markRestoredSuggestions(queue: Track[], autoplayCount: number): Track[] {
  if (autoplayCount <= 0 || queue.some((track) => track.suggested)) return queue;
  const start = Math.max(0, queue.length - autoplayCount);
  return queue.map((track, i) => (i >= start ? { ...track, suggested: true as const } : track));
}

function userQueued(track: Track): Track {
  return { ...plainTrack(track), queued: true };
}

export function resumeFrom(position: number, duration: number): number {
  if (!Number.isFinite(position)) return 0;
  if (duration > 0 && position >= duration - END_SLACK_S) return 0;
  return Math.max(0, position);
}

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
  smartShuffle: boolean;
  repeat: RepeatMode;
  unshuffled: string[] | null;
  playingFrom: string | null;
  played: Track[];
  blocked: Track[];
  autoplayCount: number;
  awaitingAutoplay: boolean;
  error: string | null;
  contextId: number;
};

type PlayerPersisted = Pick<
  PlayerValues,
  | "queue"
  | "index"
  | "position"
  | "duration"
  | "volume"
  | "muted"
  | "shuffle"
  | "smartShuffle"
  | "repeat"
  | "unshuffled"
  | "playingFrom"
  | "autoplayCount"
>;

export type PlayerState = PlayerValues & {
  playQueue: (tracks: Track[], startIndex?: number, from?: string) => void;
  playTrack: (track: Track) => void;
  startRadio: (track: Track) => Promise<void>;
  playArtistMix: (artistId: string, topSongs: Track[]) => void;
  jumpTo: (index: number) => void;
  addToQueue: (tracks: Track[], playNext?: boolean, at?: number) => number;
  removeAt: (index: number) => void;
  moveUpcoming: (from: number, to: number) => void;
  dontPlay: (index: number) => void;
  clearUpcoming: () => void;
  next: (manual?: boolean) => void;
  prev: () => void;
  prevTrack: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleShuffle: () => void;
  cycleRepeat: () => void;
  handleEnded: () => void;
};

let loadedId: string | null = null;
let loadGeneration = 0;
let resumePosition = 0;
let resumeTrackId: string | null = null;
let restoredOnLaunch = false;

function playMetaFor(track: Track): PlayMeta {
  const artwork = thumbArtwork(track.thumb, 544);
  return {
    artist: track.artist,
    artworkUrl: /^https?:\/\//.test(artwork) ? artwork : undefined,
    durationMs: Math.round((track.duration ?? 0) * 1000),
  };
}

function load(track: Track, fromSeconds = 0) {
  const generation = ++loadGeneration;
  loadedId = track.id;
  usePlayer.setState({ duration: 0 });
  prefetchLyrics(track);
  const started = playStream(track.id, track.title, fromSeconds, playMetaFor(track));
  started.catch(() => {
    if (generation !== loadGeneration || usePlayer.getState().queue[usePlayer.getState().index]?.id !== track.id) return;
    usePlayer.setState({ playing: false, buffering: false });
    useUI.getState().toast(playFailedMessage(track.title), "error");
  });
  started.then(() => {
    if (generation !== loadGeneration) return;
    const { queue, index } = usePlayer.getState();
    prefetchAhead(queue.slice(index + 1).map((item) => item.id));
  }, () => undefined);
}

let refilling = false;
let failedAt = Number.NEGATIVE_INFINITY;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function autoplayEligible(state: PlayerValues): boolean {
  const last = state.queue.at(-1);
  return (
    useSettings.getState().autoplay &&
    state.repeat === "off" &&
    last !== undefined &&
    !last.episode &&
    isRadioSeed(last.id)
  );
}

function suggestionsAhead(state: PlayerValues): number {
  return state.queue.slice(state.index + 1).filter((track) => track.suggested).length;
}

function wantsMore(state: PlayerValues): boolean {
  if (!autoplayEligible(state)) return false;
  if (state.awaitingAutoplay) return true;
  if (!state.playing || Date.now() - failedAt < RETRY_AFTER_MS) return false;
  const ahead = suggestionsAhead(state);
  const ownLeft = state.queue.length - ahead - state.index - 1;
  return ownLeft <= 1 && ahead < LOW_WATER;
}

function giveUp() {
  failedAt = Date.now();
  if (usePlayer.getState().awaitingAutoplay) {
    usePlayer.setState({ error: AUTOPLAY_EMPTY_MESSAGE, awaitingAutoplay: false, playing: false });
    useUI.getState().toast(AUTOPLAY_EMPTY_MESSAGE, "info");
    return;
  }
  usePlayer.setState({ error: AUTOPLAY_EMPTY_MESSAGE });
}

function appendAutoplay(incoming: Track[]) {
  const { queue, index, autoplayCount, awaitingAutoplay } = usePlayer.getState();
  const upcoming = new Set(queue.slice(index).map((track) => track.id));
  const fresh = incoming.filter((track) => !upcoming.has(track.id)).map((track) => ({ ...track, suggested: true as const }));
  if (fresh.length === 0) {
    giveUp();
    return;
  }
  const drop = Math.max(0, index - HISTORY_KEEP);
  const kept = queue.slice(drop);
  failedAt = 0;
  usePlayer.setState({
    queue: [...kept, ...fresh],
    index: index - drop,
    autoplayCount: autoplayCount + fresh.length,
    error: null,
  });
  if (awaitingAutoplay) {
    usePlayer.setState({ index: kept.length });
    startCurrent();
  }
}

function settleRefill(context: number, batch: Track[]) {
  refilling = false;
  const state = usePlayer.getState();
  if (state.contextId !== context) {
    if (state.awaitingAutoplay) refillIfNeeded();
    return;
  }
  if (batch.length === 0) giveUp();
  else appendAutoplay(batch);
}

function exclusionsNow(state: PlayerValues): Exclusions {
  const exclusions = exclusionsFor([...state.queue, ...state.played, ...state.blocked]);
  if (!useSettings.getState().dontRepeatSuggestions) return exclusions;
  const libraryIds = useLibrary.getState().history.map((track) => track.id);
  return { ...exclusions, excludeIds: new Set([...exclusions.excludeIds, ...libraryIds]) };
}

let smartPicking = false;
let smartFailedAt = Number.NEGATIVE_INFINITY;

function refillSmart() {
  const state = usePlayer.getState();
  const current = state.queue[state.index];
  if (smartPicking || !state.shuffle || !state.smartShuffle || !current || !isRadioSeed(current.id)) return;
  if (hasRecommendationAhead(state.queue, state.index) || Date.now() - smartFailedAt < SMART_RETRY_MS) return;
  smartPicking = true;
  const context = state.contextId;
  void fetchSuggestions([current.id], exclusionsNow(state), 1).then(
    (picks) => settleSmart(context, picks),
    (error: unknown) => {
      console.warn(`[hushio] Smart shuffle pick failed: ${describeError(error)}`);
      smartPicking = false;
      smartFailedAt = Date.now();
    },
  );
}

function settleSmart(context: number, picks: Track[]) {
  smartPicking = false;
  const state = usePlayer.getState();
  if (state.contextId !== context || !state.shuffle || !state.smartShuffle) return;
  const pick = picks[0];
  if (!pick) {
    smartFailedAt = Date.now();
    return;
  }
  usePlayer.setState({ queue: withRecommendation(state.queue, state.index, pick) });
}

function refillIfNeeded() {
  refillSmart();
  const state = usePlayer.getState();
  if (refilling || !wantsMore(state)) return;
  refilling = true;
  const seeds = [state.queue.at(-1), state.queue[state.index]].flatMap((track) => (track ? [track.id] : []));
  const exclusions = exclusionsNow(state);
  const limit = MAX_TAIL - suggestionsAhead(state);
  const context = state.contextId;
  void fetchRefill(seeds, exclusions, limit).then(
    (batch) => settleRefill(context, batch),
    (error: unknown) => {
      console.warn(`[hushio] AutoPlay refill failed: ${describeError(error)}`);
      settleRefill(context, []);
    },
  );
}

function startCurrent() {
  const { queue, index, played } = usePlayer.getState();
  const track = queue[index];
  if (!track) return;
  const restored = track.id === resumeTrackId ? resumePosition : 0;
  resumePosition = 0;
  resumeTrackId = null;
  usePlayer.setState({
    playing: true,
    position: restored,
    error: null,
    awaitingAutoplay: false,
    played: [track, ...played.filter((item) => item.id !== track.id)].slice(0, PLAYED_LIMIT),
  });
  useLibrary.getState().pushHistory(track);
  startListen(track);
  load(track, restored);
  refillIfNeeded();
}

const saved = persistStorage<PlayerPersisted>("player");
let lastSaved = "";
const POSITION_WRITE_MS = 3000;
let lastState: PlayerPersisted | null = null;
let lastWriteAt = 0;
let pending: { name: string; value: StorageValue<PlayerPersisted> } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function onlyPositionChanged(next: PlayerPersisted, previous: PlayerPersisted): boolean {
  return (Object.keys(next) as (keyof PlayerPersisted)[]).every(
    (key) => key === "position" || key === "duration" || next[key] === previous[key],
  );
}

function cancelPendingWrite() {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = null;
  pending = null;
}

function writeNow(name: string, value: StorageValue<PlayerPersisted>) {
  lastState = value.state;
  lastWriteAt = Date.now();
  const json = JSON.stringify(value);
  if (json === lastSaved) return;
  lastSaved = json;
  return saved.setItem(name, value);
}

function flushPendingWrite() {
  const next = pending;
  cancelPendingWrite();
  if (next) writeNow(next.name, next.value);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingWrite);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrite();
  });
}

const storage: PersistStorage<PlayerPersisted> = {
  getItem: saved.getItem,
  setItem: (name, value) => {
    const since = Date.now() - lastWriteAt;
    if (lastState && since < POSITION_WRITE_MS && onlyPositionChanged(value.state, lastState)) {
      pending = { name, value };
      if (pendingTimer === null) pendingTimer = setTimeout(flushPendingWrite, POSITION_WRITE_MS - since);
      return;
    }
    cancelPendingWrite();
    return writeNow(name, value);
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
      smartShuffle: false,
      repeat: "off",
      unshuffled: null,
      playingFrom: null,
      played: [],
      blocked: [],
      autoplayCount: 0,
      awaitingAutoplay: false,
      error: null,
      contextId: 0,

      playQueue: (tracks, startIndex = 0, from) => {
        if (tracks.length === 0) return;
        resumePosition = 0;
        const start = Math.min(Math.max(startIndex, 0), tracks.length - 1);
        const { shuffle, contextId } = get();
        const plain = tracks.map(plainTrack);
        const queue = shuffle
          ? [plain[start], ...seededShuffle([...plain.slice(0, start), ...plain.slice(start + 1)], randomSeed())]
          : plain;
        set({
          queue,
          index: shuffle ? 0 : start,
          unshuffled: shuffle ? orderFrom(tracks, start) : null,
          playingFrom: from ?? null,
          autoplayCount: 0,
          contextId: contextId + 1,
        });
        startCurrent();
      },

      playTrack: (incoming) => {
        const track = plainTrack(incoming);
        const { queue, index, shuffle, unshuffled, contextId } = get();
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
            autoplayCount: 0,
            contextId: contextId + 1,
          });
        }
        startCurrent();
      },

      startRadio: async (track) => {
        const picks = await fetchSuggestions([track.id], exclusionsFor([track]), MAX_TAIL).catch(
          (error: unknown) => {
            console.warn(`[hushio] start radio failed: ${describeError(error)}`);
            return [];
          },
        );
        if (picks.length === 0) {
          useUI.getState().toast("Couldn't start radio right now", "error");
          return;
        }
        get().playQueue([track, ...picks]);
      },

      playArtistMix: (artistId, topSongs) => {
        const unique = [...new Map(topSongs.map((track) => [track.id, track])).values()];
        get().playQueue(seededShuffle(unique, hash32(artistId) ^ Date.now()).slice(0, ARTIST_MIX_SIZE));
      },

      jumpTo: (target) => {
        if (target < 0 || target >= get().queue.length) return;
        set({ index: target });
        startCurrent();
      },

      addToQueue: (tracks, playNext = false, at) => {
        const unique = tracks.filter((track, i) => tracks.findIndex((item) => item.id === track.id) === i);
        if (unique.length === 0) return 0;
        const { queue, index, shuffle, unshuffled } = get();

        if (queue.length === 0) {
          const first = unique.map(userQueued);
          set({
            queue: first,
            index: 0,
            playing: false,
            unshuffled: shuffle ? first.map((track) => track.id) : null,
          });
          return unique.length;
        }

        const noDuplicates = useSettings.getState().noDuplicateQueue;
        const upcoming = new Set(queue.slice(index + 1).map((track) => track.id));
        const wholeQueue = new Set(queue.map((track) => track.id));
        const add = unique.filter((track) =>
          noDuplicates ? !wholeQueue.has(track.id) : !upcoming.has(track.id),
        );
        if (add.length === 0) return 0;
        const ids = add.map((track) => track.id);
        const end = queuedEnd(queue, index);
        const position = playNext ? index + 1 : at === undefined ? end : Math.min(Math.max(at, index + 1), end);

        set({
          queue: [...queue.slice(0, position), ...add.map(userQueued), ...queue.slice(position)],
          unshuffled:
            shuffle && unshuffled ? insertIds(unshuffled, ids, queue[position - 1]?.id) : unshuffled,
        });
        return add.length;
      },

      moveUpcoming: (from, to) => {
        const { queue, index } = get();
        const count = queue.length;
        if (from <= index || to <= index || from >= count || to >= count || from === to) return;
        const next = moveItem(queue, from, to);
        const landsQueued = to - 1 === index || next[to - 1].queued === true;
        next[to] = landsQueued ? userQueued(next[to]) : next[to].suggested ? next[to] : plainTrack(next[to]);
        set({ queue: next });
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
          stopListen();
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

      dontPlay: (target) => {
        const track = get().queue[target];
        if (!track) return;
        set((state) => ({ blocked: [...state.blocked, track] }));
        get().removeAt(target);
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
        if (atEnd && repeat !== "all") {
          if (autoplayEligible(get())) {
            set({ awaitingAutoplay: true });
            refillIfNeeded();
            return;
          }
          if (!manual) {
            set({ playing: false, position: 0 });
            return;
          }
        }
        const to = advance(queue, index, shuffle);
        set({ queue: to.queue, index: to.index, position: 0 });
        startCurrent();
      },

      prev: () => {
        const { position } = get();
        if (position > RESTART_AFTER_S) {
          seekTo(0);
          set({ position: 0 });
          return;
        }
        get().prevTrack();
      },

      prevTrack: () => {
        const { queue, index, repeat } = get();
        if (queue.length === 0) return;
        if (index === 0 && repeat !== "all") {
          seekTo(0);
          set({ position: 0 });
          return;
        }
        set({ index: index > 0 ? index - 1 : queue.length - 1, position: 0 });
        startCurrent();
      },

      toggle: () => {
        const { queue, index, playing } = get();
        const track = queue[index];
        if (!track) return;
        if (playing) {
          pauseAudio();
          set({ playing: false, awaitingAutoplay: false });
          return;
        }
        if (loadedId === track.id) {
          const atEnd = resumeFrom(get().position, get().duration) === 0 && get().position > 0;
          if (atEnd) {
            seekTo(0);
            set({ playing: true, position: 0 });
          } else {
            set({ playing: true });
          }
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
        if (resumeTrackId !== null) resumePosition = position;
      },

      setVolume: (value) => {
        if (!Number.isFinite(value)) return;
        const volume = Math.min(1, Math.max(0, value));
        setAudioVolume(volume * useSleepTimer.getState().level);
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
          const plain = withoutUpcomingRecommendations(queue, index);
          const ordered = inYourOrder(plain, index, unshuffled ?? []);
          const upcoming = ordered.slice(index + 1);
          set({
            shuffle: false,
            smartShuffle: false,
            unshuffled: null,
            queue: [
              ...ordered.slice(0, index + 1),
              ...upcoming.filter((track) => track.queued),
              ...upcoming.filter((track) => !track.queued),
            ],
          });
          return;
        }
        set({ shuffle: true, smartShuffle: false, unshuffled: orderFrom(queue, index), queue: shuffleUpcoming(queue, index) });
      },

      cycleShuffle: () => {
        const { shuffle, smartShuffle } = get();
        if (!shuffle || smartShuffle) {
          get().toggleShuffle();
          return;
        }
        set({ smartShuffle: true });
        refillSmart();
      },

      cycleRepeat: () => set((state) => ({ repeat: NEXT_REPEAT[state.repeat] })),

      handleEnded: () => {
        if (useSleepTimer.getState().endOfSong) {
          useSleepTimer.getState().cancel();
          set({ playing: false, awaitingAutoplay: false });
          return;
        }
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
      version: 4,
      migrate: (persisted, version) => {
        let state = persisted as PlayerPersisted;
        if (version < 2) state = { ...state, smartShuffle: false };
        if (version < 3) state = { ...state, queue: state.queue.map(plainTrack) };
        if (version < 4) state = { ...state, queue: markRestoredSuggestions(state.queue, state.autoplayCount) };
        return state;
      },
      storage,
      partialize: (state): PlayerPersisted => ({
        queue: state.queue,
        index: state.index,
        position: state.position,
        duration: state.duration,
        volume: state.volume,
        muted: state.muted,
        shuffle: state.shuffle,
        smartShuffle: state.smartShuffle,
        repeat: state.repeat,
        unshuffled: state.unshuffled,
        playingFrom: state.playingFrom,
        autoplayCount: state.autoplayCount,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        setAudioVolume(state.volume);
        setMuted(state.muted);
        resumePosition = resumeFrom(state.position, state.duration);
        resumeTrackId = state.queue[state.index]?.id ?? null;
        restoredOnLaunch = true;
      },    },
  ),
);

export function currentTrack(state: PlayerState): Track | null {
  return state.queue[state.index] ?? null;
}

function resumeSavedQueue(): void {
  if (!restoredOnLaunch) return;
  restoredOnLaunch = false;
  if (!useSettings.getState().restoreQueueOnRestart) {
    usePlayer.setState({ queue: [], index: 0, position: 0, duration: 0, playing: false, unshuffled: null });
    resumePosition = 0;
    return;
  }
  const { queue, index } = usePlayer.getState();
  if (queue.length === 0) return;
  usePlayer.setState({ index: Math.min(Math.max(index, 0), queue.length - 1), position: resumePosition });
}

export function resumeQueueAfterHydration(): void {
  const ready = () => usePlayer.persist.hasHydrated() && useSettings.persist.hasHydrated();
  if (ready()) {
    resumeSavedQueue();
    return;
  }
  const check = () => {
    if (!ready()) return;
    resumeSavedQueue();
  };
  if (!usePlayer.persist.hasHydrated()) usePlayer.persist.onFinishHydration(check);
  if (!useSettings.persist.hasHydrated()) useSettings.persist.onFinishHydration(check);
}

export function nextBlendTarget(): BlendTarget | null {
  const { queue, index, repeat, shuffle } = usePlayer.getState();
  if (useSleepTimer.getState().endOfSong) return null;
  const at = gaplessNextIndex(queue.length, index, repeat, shuffle);
  const track = queue[at];
  return track ? { id: track.id, title: track.title, index: at } : null;
}

export function finishBlend(target: BlendTarget, { position, duration, ended }: BlendEnd): void {
  const { queue, played, index, repeat } = usePlayer.getState();
  if (repeat === "one" && target.index === index) {
    usePlayer.setState({ playing: true, buffering: false, position, duration });
    return;
  }
  const track = queue[target.index];
  loadedId = track.id;
  usePlayer.setState({
    index: target.index,
    playing: true,
    buffering: false,
    position,
    duration,
    error: null,
    played: [track, ...played.filter((item) => item.id !== track.id)].slice(0, PLAYED_LIMIT),
  });
  useLibrary.getState().pushHistory(track);
  startListen(track);
  resumeListen();
  setListenDuration(duration);
  prefetchLyrics(track);
  refillIfNeeded();
  if (ended) usePlayer.getState().handleEnded();
}

export function playFromRow(tracks: Track[], row: number, from?: string) {
  usePlayer.getState().playQueue(tracks, row, from);
}

audio.addEventListener("play", () => usePlayer.setState({ playing: true }));
audio.addEventListener("pause", () => {
  usePlayer.setState({ playing: false });
  pauseListen();
});
audio.addEventListener("playing", () => {
  usePlayer.setState({ playing: true, buffering: false });
  resumeListen();
});
audio.addEventListener("waiting", () => usePlayer.setState({ buffering: true }));
audio.addEventListener("timeupdate", () => {
  usePlayer.setState({ position: audio.currentTime });
  tick();
});
audio.addEventListener("durationchange", () => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  usePlayer.setState({ duration });
  setListenDuration(duration);
});
audio.addEventListener("ended", () => usePlayer.getState().handleEnded());
