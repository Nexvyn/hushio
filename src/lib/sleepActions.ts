import { useSleepTimer } from "../stores/sleepTimer";
import { type MenuItem, useUI } from "../stores/ui";
import { formatSleepLeft, parseSleepMinutes, SLEEP_MAX_MINUTES, SLEEP_PRESETS } from "./sleepTimer";

const INVALID_TIME = "Enter a time from 1 minute to 12 hours";

type SleepSnapshot = { endsAt: number | null; endOfSong: boolean };

function sleepRunning(state: SleepSnapshot): boolean {
  return state.endOfSong || state.endsAt !== null;
}

export function sleepStatus(state: SleepSnapshot, now: number): string | null {
  if (state.endOfSong) return "Stops after this song";
  if (state.endsAt !== null) return `Stops in ${formatSleepLeft(state.endsAt - now)}`;
  return null;
}

export function startFor(minutes: number, label: string) {
  useSleepTimer.getState().start(minutes);
  useUI.getState().toast(`Music stops in ${label}`);
}

export function startAtSongEnd() {
  useSleepTimer.getState().startEndOfSong();
  useUI.getState().toast("Music stops after this song");
}

function checkCustomTime(value: string): string | null {
  const minutes = parseSleepMinutes(value);
  if (minutes !== null && minutes >= 1 && minutes <= SLEEP_MAX_MINUTES) return null;
  useUI.getState().toast(INVALID_TIME, "error");
  return INVALID_TIME;
}

export function openCustomSleepDialog() {
  useUI.getState().openDialog({
    title: "Sleep timer",
    body: "Stop the music after how long? Minutes, or hours and minutes like 1:30 — up to 12 hours.",
    initialValue: "60",
    placeholder: "Minutes",
    confirmLabel: "Start",
    validate: checkCustomTime,
    onConfirm: (value) => {
      const minutes = parseSleepMinutes(value);
      if (minutes !== null) startFor(minutes, formatSleepLeft(minutes * 60_000));
    },
  });
}

export function sleepMenuItems(): MenuItem[] {
  const running = sleepRunning(useSleepTimer.getState());
  return [
    ...SLEEP_PRESETS.map(({ label, minutes }) => ({ label, onSelect: () => startFor(minutes, label) })),
    { label: "End of this song", onSelect: startAtSongEnd },
    { label: "Custom", onSelect: openCustomSleepDialog },
    ...(running
      ? [{ label: "Turn off", separatorBefore: true, onSelect: () => useSleepTimer.getState().cancel() }]
      : []),
  ];
}
