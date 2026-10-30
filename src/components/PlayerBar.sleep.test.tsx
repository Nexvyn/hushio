import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  }
  return {
    audio: new Audio(),
    playStream: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
  };
});

vi.mock("../lib/audio", () => ({
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

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PlayerBar } from "./PlayerBar";
import { usePlayer } from "../stores/player";
import { useSleepTimer } from "../stores/sleepTimer";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();
const initialSleep = useSleepTimer.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useUI.setState(initialUI, true);
  useSleepTimer.setState(initialSleep, true);
  usePlayer.getState().playQueue([track(0), track(1)], 0);
});

afterEach(() => {
  useSleepTimer.getState().cancel();
  cleanup();
});

function sleepButton() {
  return screen.getByRole("button", { name: /^Sleep timer/ });
}

function openSleepMenu() {
  fireEvent.click(sleepButton());
  return useUI.getState().contextMenu;
}

describe("sleep timer button in the player bar", () => {
  it("opens a menu headed Sleep timer with the presets, end of song and custom", () => {
    render(<PlayerBar />);

    const menu = openSleepMenu();

    expect(menu?.above).toBe(true);
    expect(menu?.items[0]).toMatchObject({ label: "Sleep timer", header: true });
    expect(menu?.items.slice(1).map((item) => item.label)).toEqual([
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

  it("starts a timer from a preset and shows the countdown beside the moon", () => {
    render(<PlayerBar />);
    act(() => {
      openSleepMenu();
    });
    const menu = useUI.getState().contextMenu;
    act(() => {
      menu?.items.find((item) => item.label === "5 minutes")?.onSelect?.();
    });

    expect(useSleepTimer.getState().endsAt).not.toBeNull();
    expect(screen.getByText("5:00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sleep timer: stops in 5:00" })).toBeTruthy();
  });

  it("shows the end-of-song status and no countdown", () => {
    useSleepTimer.getState().startEndOfSong();
    const { container } = render(<PlayerBar />);

    expect(screen.getByRole("button", { name: "Sleep timer: stops after this song" })).toBeTruthy();
    expect(container.querySelector(".-ml-0\\.5")).toBeNull();
  });

  it("counts the countdown down once a second", () => {
    vi.useFakeTimers();
    try {
      useSleepTimer.getState().start(1);
      render(<PlayerBar />);
      expect(screen.getByText("1:00")).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(screen.getByText("0:55")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers Turn off in the menu while a timer runs", () => {
    useSleepTimer.getState().start(15);
    render(<PlayerBar />);

    const labels = openSleepMenu()?.items.map((item) => item.label);

    expect(labels?.at(-1)).toBe("Turn off");
  });

  it("closes the menu when the button is pressed again", () => {
    render(<PlayerBar />);
    openSleepMenu();

    fireEvent.click(sleepButton());

    expect(useUI.getState().contextMenu).toBeNull();
  });
});
