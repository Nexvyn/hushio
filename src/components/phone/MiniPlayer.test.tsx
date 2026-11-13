import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import type { Track } from "../../types";

if (!("PointerEvent" in window)) {
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: class PointerEvent extends MouseEvent {} });
}

const { audio, playStream, play, pause, seekTo, setVolume, setMuted, getPlaybackPosition } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(() => Promise.resolve()),
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getPlaybackPosition: vi.fn(() => 0),
}));

vi.mock("../../lib/audio", () => ({ audio, playStream, play, pause, seekTo, setVolume, setMuted, getPlaybackPosition }));
vi.mock("../../lib/lyrics", () => ({ prefetchLyrics: () => {} }));
vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { MiniPlayer } from "./MiniPlayer";
import { usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });

function pointer(type: "pointerDown" | "pointerUp", target: Element, clientY: number) {
  const event = createEvent[type](target, { clientX: 120, clientY });
  fireEvent(target, event);
}

beforeEach(() => {
  usePlayer.setState({ queue: [track(1), track(2)], index: 0, playing: false, buffering: false, position: 30, duration: 200 });
  useUI.setState({ nowPlayingOpen: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MiniPlayer", () => {
  it("is hidden when there is no current item", () => {
    usePlayer.setState({ queue: [], index: 0 });
    render(<MiniPlayer />);
    expect(screen.queryByRole("region", { name: "Mini player" })).toBeNull();
  });

  it("shows the title and artist of the current item", () => {
    render(<MiniPlayer />);
    expect(screen.getByText("Track 1")).toBeTruthy();
    expect(screen.getByText("Artist 1")).toBeTruthy();
  });

  it("starts playback from the play control", () => {
    render(<MiniPlayer />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(playStream).toHaveBeenCalledWith("t1", "Track 1");
  });

  it("pauses from the pause control while playing", () => {
    usePlayer.setState({ playing: true });
    render(<MiniPlayer />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalled();
    expect(usePlayer.getState().playing).toBe(false);
  });

  it("moves to the next item from the next control", () => {
    render(<MiniPlayer />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(usePlayer.getState().index).toBe(1);
    expect(playStream).toHaveBeenCalledWith("t2", "Track 2");
  });

  it("opens Now Playing on tap", () => {
    render(<MiniPlayer />);
    fireEvent.click(screen.getByRole("button", { name: "Open Now Playing: Track 1" }));
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("opens Now Playing on a swipe up", () => {
    render(<MiniPlayer />);
    const region = screen.getByRole("region", { name: "Mini player" });
    pointer("pointerDown", region, 500);
    pointer("pointerUp", region, 430);
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("ignores a short upward movement", () => {
    render(<MiniPlayer />);
    const region = screen.getByRole("region", { name: "Mini player" });
    pointer("pointerDown", region, 500);
    pointer("pointerUp", region, 470);
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });

  it("ignores a downward swipe", () => {
    render(<MiniPlayer />);
    const region = screen.getByRole("region", { name: "Mini player" });
    pointer("pointerDown", region, 400);
    pointer("pointerUp", region, 480);
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });

  it("draws progress from the player position", () => {
    render(<MiniPlayer />);
    const fill = screen.getByRole("region", { name: "Mini player" }).querySelector("[style*='scaleX']");
    expect(fill?.getAttribute("style")).toContain("scaleX(0.15)");
  });

  it("draws the progress fill in solid ink so it is visible", () => {
    render(<MiniPlayer />);
    const fill = screen.getByRole("region", { name: "Mini player" }).querySelector("[data-progress-fill]");
    expect(fill?.className).toContain("bg-ink-1");
    expect(fill?.className).not.toContain("/0.055");
  });

  it("shows the play control as a plain 44px icon button", () => {
    render(<MiniPlayer />);
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.className).toContain("size-11");
    expect(play.className).toContain("text-ink-1");
    expect(play.className).not.toContain("bg-primary");
  });

  it("keeps the elevated bar and ink text until a cover colour is ready", () => {
    render(<MiniPlayer />);
    const region = screen.getByRole("region", { name: "Mini player" });
    const bar = region.firstElementChild as HTMLElement;
    expect(bar.style.backgroundColor).toBe("");
    expect(screen.getByText("Track 1").className).toContain("text-ink-1");
    expect(screen.getByText("Artist 1").className).toContain("text-ink-2");
    expect(screen.getByRole("button", { name: "Play" }).querySelector("svg")?.getAttribute("width")).toBe("24");
  });

  it("draws a solid bar without a border", () => {
    render(<MiniPlayer />);
    const bar = screen.getByRole("region", { name: "Mini player" }).firstElementChild as HTMLElement;
    expect(bar.className).toContain("bg-elevated");
    expect(bar.className).toContain("rounded-[12px]");
    expect(bar.className).not.toContain("border");
    expect(bar.style.height).toBe("56px");
  });
});
