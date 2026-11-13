import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.hoisted(() => {
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
});

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));

vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getPlaybackPosition: vi.fn(() => 0),
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

import { SyncedLyrics } from "./SyncedLyrics";
import type { LyricsResult } from "../lib/bridge";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";

const lyrics: LyricsResult = {
  synced: [
    { time: 1, text: "First line" },
    { time: 2, text: "Second line" },
    { time: 3, text: "Third line" },
  ],
  plain: null,
  source: "Test Source",
  wordSynced: false,
};

function lineButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-line]"));
}

beforeEach(() => {
  usePlayer.setState({ position: 2.2, playing: false });
  useSettings.setState({
    syncedLyrics: true,
    blurUnfocusedLyrics: true,
    romanizeLyrics: false,
    reduceAnimation: false,
    reduceDynamicBlur: false,
    lyricsOffset: 0,
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SyncedLyrics on phone", () => {
  it("sets the active line at 22px full strength and the others at 18px faded", () => {
    render(<SyncedLyrics lyrics={lyrics} loading={false} />);
    const [first, active, third] = lineButtons();

    const activeText = active.querySelector("span") as HTMLSpanElement;
    expect(activeText.className).toContain("text-[22px]");
    expect(activeText.className).toContain("font-bold");
    expect(active.className).toContain("text-ink-1");
    expect(Number(active.style.opacity)).toBeCloseTo(1, 5);

    for (const line of [first, third]) {
      const text = line.querySelector("span") as HTMLSpanElement;
      expect(text.className).toContain("text-[18px]");
      expect(text.className).toContain("font-medium");
      expect(line.className).toContain("text-ink-2");
      expect(Number(line.style.opacity)).toBeCloseTo(0.7, 5);
    }
  });

  it("drops blur, glow and depth scaling on every line", () => {
    render(<SyncedLyrics lyrics={lyrics} loading={false} />);
    for (const line of lineButtons()) {
      expect(line.style.filter).toBe("");
      expect(line.style.transform).toBe("");
    }
  });

  it("uses a 14px gap between lines", () => {
    const { container } = render(<SyncedLyrics lyrics={lyrics} loading={false} />);
    expect(container.querySelector(".space-y-3\\.5")).not.toBeNull();
    expect(container.querySelector(".space-y-5")).toBeNull();
  });

  it("uses the on-art colour, 55% for other lines and no blur when the lyrics sit on the artwork", () => {
    render(<SyncedLyrics lyrics={lyrics} loading={false} onArt />);
    const [first, active] = lineButtons();

    expect(active.className).toContain("text-art");
    expect(active.className).not.toContain("text-ink-1");
    expect((active.querySelector("span") as HTMLSpanElement).className).toContain("text-[22px]");
    expect(first.className).toContain("text-art/[0.55]");
    expect(Number(first.style.opacity)).toBeCloseTo(1, 5);
    expect(first.style.filter).toBe("");
  });
});
