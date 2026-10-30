import { create } from "zustand";
import { pause as pauseAudio, setVolume as setAudioVolume } from "../lib/audio";
import { SLEEP_MAX_MINUTES, SLEEP_RESTORE_MS, SLEEP_TICK_MS, sleepLevel } from "../lib/sleepTimer";
import { usePlayer } from "./player";

type SleepState = {
  endsAt: number | null;
  endOfSong: boolean;
  level: number;
  start: (minutes: number) => void;
  startEndOfSong: () => void;
  cancel: () => void;
};

let ticker: ReturnType<typeof setInterval> | null = null;
let restore: ReturnType<typeof setTimeout> | null = null;

function clearTicker() {
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
}

function clearRestore() {
  if (restore !== null) clearTimeout(restore);
  restore = null;
}

function applyLevel(level: number) {
  if (useSleepTimer.getState().level === level) return;
  useSleepTimer.setState({ level });
  setAudioVolume(usePlayer.getState().volume * level);
}

function fire() {
  applyLevel(0);
  clearTicker();
  useSleepTimer.setState({ endsAt: null });
  pauseAudio();
  usePlayer.setState({ playing: false, awaitingAutoplay: false });
  restore = setTimeout(() => {
    restore = null;
    applyLevel(1);
  }, SLEEP_RESTORE_MS);
}

function tick() {
  const { endsAt, endOfSong } = useSleepTimer.getState();
  if (endsAt !== null) {
    const remaining = endsAt - Date.now();
    if (remaining <= 0) fire();
    else applyLevel(sleepLevel(remaining));
    return;
  }
  if (!endOfSong) return;
  const { duration, position } = usePlayer.getState();
  if (duration > 0) applyLevel(sleepLevel((duration - position) * 1000));
}

function startTicker() {
  clearTicker();
  ticker = setInterval(tick, SLEEP_TICK_MS);
}

function reset(values: Pick<SleepState, "endsAt" | "endOfSong">) {
  clearTicker();
  clearRestore();
  useSleepTimer.setState({ ...values, level: 1 });
  setAudioVolume(usePlayer.getState().volume);
}

export const useSleepTimer = create<SleepState>()(() => ({
  endsAt: null,
  endOfSong: false,
  level: 1,

  start: (minutes) => {
    const clamped = Math.round(Math.min(SLEEP_MAX_MINUTES, Math.max(1, minutes)));

    reset({ endsAt: Date.now() + clamped * 60_000, endOfSong: false });
    startTicker();
  },

  startEndOfSong: () => {
    reset({ endsAt: null, endOfSong: true });
    startTicker();
  },

  cancel: () => {
    reset({ endsAt: null, endOfSong: false });
  },
}));
