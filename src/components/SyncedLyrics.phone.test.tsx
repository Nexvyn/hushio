import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  type MotionButtonProps = ComponentProps<"button"> & Pick<ComponentProps<typeof actual.motion.button>, "animate" | "transition">;
  function MotionButton({ animate, transition, style, ...props }: MotionButtonProps) {
    const target = typeof animate === "object" ? animate : {};
    const opacity = "opacity" in target && typeof target.opacity === "number" ? target.opacity : undefined;
    const scale = "scale" in target && typeof target.scale === "number" ? target.scale : undefined;
    return <button {...props} style={{ ...style, opacity, scale }} />;
  }
  return { ...actual, motion: { div: actual.motion.div, button: MotionButton } };
});

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
  usePlayer.setState({ position: 2.2, playing: true });
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
  it("keeps the same font size and width constraints for active and inactive lines", () => {
    render(<SyncedLyrics lyrics={lyrics} loading={false} />);
    const [first, active, third] = lineButtons();

    const activeText = screen.getByText("Second line");
    expect(activeText.className).toContain("text-section");
    expect(activeText.style.transition).not.toContain("font-size");
    expect(active.className).toContain("text-ink-1");
    expect(Number(active.style.opacity)).toBeCloseTo(1, 5);
    expect(active.style.width).toBe("");
    expect(active.style.maxWidth).toBe("100%");

    for (const line of [first, third]) {
      const text = line.querySelector("span > span") as HTMLSpanElement;
      expect(text.className).toBe(activeText.className);
      expect(text.className).toContain("font-semibold");
      expect(line.className).toContain("text-ink-2");
      expect(line.style.width).toBe("");
      expect(line.style.maxWidth).toBe("100%");
      expect(Number(line.style.opacity)).toBeCloseTo(0.8, 5);
    }
  });

  it("blurs nothing while paused and keeps the falloff opacity", () => {
    usePlayer.setState({ playing: false });
    render(<SyncedLyrics lyrics={lyrics} loading={false} />);
    const [first, active, third] = lineButtons();
    expect(active.style.filter).toBe("");
    for (const line of [first, third]) {
      expect(line.style.filter).toBe("");
      expect(Number(line.style.opacity)).toBeCloseTo(0.8, 5);
    }
  });

  it("uses the first line as the reference before the first timestamp", () => {
    usePlayer.setState({ position: 0 });
    render(<SyncedLyrics lyrics={lyrics} loading={false} />);
    const [first, second, third] = lineButtons();
    expect(Number(first.style.opacity)).toBeCloseTo(1, 5);
    expect(first.style.filter).toBe("");
    expect(Number(second.style.opacity)).toBeCloseTo(0.8, 5);
    expect(second.style.filter).toBe("");
    expect(Number(third.style.opacity)).toBeCloseTo(0.7, 5);
    expect(first.style.scale).toBe("");
  });

  it("dims inactive lines without scale or blur during playback", () => {
    render(<SyncedLyrics lyrics={lyrics} loading={false} />);
    const [first, active, third] = lineButtons();
    expect(active.style.filter).toBe("");
    expect(active.style.scale).toBe("");
    for (const line of [first, third]) {
      expect(line.style.filter).toBe("");
      expect(line.style.scale).toBe("");
      expect(Number(line.style.opacity)).toBeCloseTo(0.8, 5);
    }
  });

  it("shows the translation under its line only when translation is on", () => {
    const withTranslation: LyricsResult = {
      ...lyrics,
      synced: [
        { time: 1, text: "Bonjour line", translation: "Hello line" },
        { time: 2, text: "Second line" },
      ],
    };
    const { rerender } = render(<SyncedLyrics lyrics={withTranslation} loading={false} translate={false} />);
    expect(screen.queryByText("Hello line")).toBeNull();

    rerender(<SyncedLyrics lyrics={withTranslation} loading={false} translate={true} />);
    const translated = screen.getByText("Hello line");
    expect(translated.className).toContain("text-ink-2");
    expect(translated.className).toContain("text-body");
    expect(translated.closest("button")?.textContent).toContain("Bonjour line");
  });

  it("uses a 14px gap between lines", () => {
    const { container } = render(<SyncedLyrics lyrics={lyrics} loading={false} />);
    expect(container.querySelector(".space-y-3\\.5")).not.toBeNull();
    expect(container.querySelector(".space-y-5")).toBeNull();
  });

  it("uses the on-art colour and the same distance falloff when the lyrics sit on the artwork", () => {
    render(<SyncedLyrics lyrics={lyrics} loading={false} onArt />);
    const [first, active] = lineButtons();

    expect(active.className).toContain("text-art");
    expect(active.className).not.toContain("text-ink-1");
    expect(screen.getByText("Second line").className).toBe(screen.getByText("First line").className);
    expect(first.className).toContain("text-art");
    expect(Number(active.style.opacity)).toBeCloseTo(1, 5);
    expect(Number(first.style.opacity)).toBeCloseTo(0.8, 5);
    expect(first.style.filter).toBe("");
    expect(active.style.filter).toBe("");
  });
});

describe("SyncedLyrics on phone with right-to-left lines", () => {
  const rtl: LyricsResult = {
    synced: [
      { time: 1, text: "First line" },
      { time: 2, text: "تُو ہی بسی، تُو ہی بسی، تُو ہی بسی" },
      { time: 3, text: "Third line" },
    ],
    plain: null,
    source: "Test Source",
    wordSynced: false,
  };

  it("sets dir auto and anchors RTL scaling on the right at the shared font size", () => {
    render(<SyncedLyrics lyrics={rtl} loading={false} />);
    const [first, active, third] = lineButtons();
    expect(active.getAttribute("dir")).toBe("auto");
    expect(active.className).toContain("text-start");
    expect(active.style.transformOrigin).toBe("right center");
    expect(active.style.scale).toBe("");
    expect(active.style.maxWidth).toBe("100%");
    expect(active.querySelector("span > span")?.className).toBe(screen.getByText("First line").className);
    expect(first.style.transformOrigin).toBe("left center");
    expect(third.style.scale).toBe("");
  });
});
