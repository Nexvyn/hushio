import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("./audio", () => ({
  audio,
  playStream,
  play,
  pause,
  seekTo,
  setVolume,
  setMuted,
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { openCustomSleepDialog, sleepMenuItems, sleepStatus } from "./sleepActions";
import { useSleepTimer } from "../stores/sleepTimer";
import { type MenuItem, useUI } from "../stores/ui";

const initialSleep = useSleepTimer.getState();
const initialUI = useUI.getState();
const labelsOf = (items: MenuItem[]) => items.map((item) => item.label);
const select = (items: MenuItem[], label: string) => {
  const item = items.find((entry) => entry.label === label);
  if (!item?.onSelect) throw new Error(`no selectable item ${label}`);
  item.onSelect();
};
const lastToast = () => useUI.getState().toasts.at(-1);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useSleepTimer.setState(initialSleep, true);
  useUI.setState({ ...initialUI, toasts: [], pendingToasts: [], dialog: null }, true);
});

afterEach(() => {
  useSleepTimer.getState().cancel();
  vi.useRealTimers();
});

describe("sleepStatus", () => {
  it("reads the end-of-song mode", () => {
    expect(sleepStatus({ endsAt: null, endOfSong: true }, 0)).toBe("Stops after this song");
  });

  it("counts down to the end time", () => {
    expect(sleepStatus({ endsAt: 245_000, endOfSong: false }, 0)).toBe("Stops in 4:05");
  });

  it("is empty when no timer runs", () => {
    expect(sleepStatus({ endsAt: null, endOfSong: false }, 0)).toBeNull();
  });
});

describe("sleepMenuItems", () => {
  it("lists the presets, end of song and custom in order, without Turn off while idle", () => {
    expect(labelsOf(sleepMenuItems())).toEqual([
      "5 minutes",
      "15 minutes",
      "30 minutes",
      "45 minutes",
      "1 hour",
      "2 hours",
      "End of this song",
      "Custom",
    ]);
  });

  it("adds a separated Turn off item while a timer runs", () => {
    useSleepTimer.getState().start(5);

    const items = sleepMenuItems();
    expect(labelsOf(items).at(-1)).toBe("Turn off");
    expect(items.at(-1)?.separatorBefore).toBe(true);
  });

  it("starts the picked preset and toasts the PRD text", () => {
    select(sleepMenuItems(), "1 hour");

    expect(useSleepTimer.getState().endsAt).toBe(Date.now() + 60 * 60_000);
    expect(lastToast()?.message).toBe("Music stops in 1 hour");
    expect(lastToast()?.kind).toBe("info");
  });

  it("starts end-of-song mode and toasts the PRD text", () => {
    select(sleepMenuItems(), "End of this song");

    expect(useSleepTimer.getState().endOfSong).toBe(true);
    expect(lastToast()?.message).toBe("Music stops after this song");
  });

  it("turns the timer off from the Turn off item", () => {
    useSleepTimer.getState().start(5);

    select(sleepMenuItems(), "Turn off");

    expect(useSleepTimer.getState().endsAt).toBeNull();
    expect(useSleepTimer.getState().endOfSong).toBe(false);
  });
});

describe("custom sleep dialog", () => {
  function dialog() {
    const request = useUI.getState().dialog;
    if (!request?.validate) throw new Error("custom sleep dialog is not open");
    return request;
  }

  it("opens with the PRD copy and the initial value 60", () => {
    openCustomSleepDialog();

    expect(dialog()).toMatchObject({
      title: "Sleep timer",
      body: "Stop the music after how long? Minutes, or hours and minutes like 1:30 — up to 12 hours.",
      initialValue: "60",
      placeholder: "Minutes",
      confirmLabel: "Start",
    });
  });

  it.each(["0", "721", "", "abc", "13:00:00"])("rejects %j with an error toast and the PRD text", (value) => {
    openCustomSleepDialog();

    expect(dialog().validate?.(value)).toBe("Enter a time from 1 minute to 12 hours");
    expect(lastToast()).toMatchObject({ message: "Enter a time from 1 minute to 12 hours", kind: "error" });
    expect(useSleepTimer.getState().endsAt).toBeNull();
  });

  it.each(["1", "720", "1:30", "2h 15m"])("accepts %j", (value) => {
    openCustomSleepDialog();

    expect(dialog().validate?.(value)).toBeNull();
  });

  it("starts the timer with the entered time and toasts the formatted length", () => {
    openCustomSleepDialog();

    dialog().onConfirm("1:30");

    expect(useSleepTimer.getState().endsAt).toBe(Date.now() + 90 * 60_000);
    expect(lastToast()?.message).toBe("Music stops in 1:30:00");
  });
});
