import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { setPulling, sheetY, travelPx, unmountSheet } from "./sheetTravel";
import { usePlayer } from "../../stores/player";
import { useLibrary } from "../../stores/library";
import { useUI } from "../../stores/ui";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });

const region = () => screen.getByRole("region", { name: "Mini player" });
const body = () => screen.getByRole("button", { name: "Open Now Playing: Track 1" });
const at = (clientX: number, clientY: number) => ({ clientX, clientY });

function down(target: Element, x = 120, y = 500) {
  fireEvent.pointerDown(target, at(x, y));
}

function move(target: Element, x: number, y: number) {
  fireEvent.pointerMove(target, at(x, y));
}

function up(target: Element, x: number, y: number) {
  fireEvent.pointerUp(target, at(x, y));
}

function tap(target: Element, x = 120, y = 500) {
  down(target, x, y);
  up(target, x, y);
  fireEvent.click(target);
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
  unmountSheet();
  setPulling(false);
  usePlayer.setState({ queue: [track(1), track(2)], index: 0, playing: false, buffering: false, position: 30, duration: 200 });
  useUI.setState({ nowPlayingOpen: false });
  useLibrary.setState({ liked: [] });
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
    expect(playStream).toHaveBeenCalledWith("t1", "Track 1", 0, expect.any(Object));
  });

  it("pauses from the pause control while playing", () => {
    usePlayer.setState({ playing: true });
    render(<MiniPlayer />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalled();
    expect(usePlayer.getState().playing).toBe(false);
  });

  it("likes and unlikes the current item without changing playback", () => {
    render(<MiniPlayer />);
    fireEvent.click(screen.getByRole("button", { name: "Add to liked songs" }));
    expect(useLibrary.getState().liked.some((item) => item.id === "t1")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove from liked songs" }));
    expect(useLibrary.getState().liked).toHaveLength(0);
    expect(usePlayer.getState().index).toBe(0);
    expect(playStream).not.toHaveBeenCalled();
  });

  it("opens Now Playing on a tap of the title", () => {
    render(<MiniPlayer />);
    tap(body());
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("opens Now Playing on a tap that wobbles a few pixels", () => {
    render(<MiniPlayer />);
    down(body(), 120, 500);
    move(body(), 120, 509);
    up(body(), 120, 509);
    fireEvent.click(body());
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("does not open Now Playing from the like or play buttons", () => {
    render(<MiniPlayer />);
    const like = screen.getByRole("button", { name: "Add to liked songs" });
    tap(like);
    expect(useLibrary.getState().liked.some((item) => item.id === "t1")).toBe(true);
    expect(useUI.getState().nowPlayingOpen).toBe(false);
    tap(screen.getByRole("button", { name: "Play" }));
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });

  it("opens Now Playing on a swipe up", () => {
    render(<MiniPlayer />);
    down(region(), 120, 500);
    move(region(), 120, 490);
    move(region(), 120, 60);
    up(region(), 120, 60);
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("drags the sheet with the finger during a swipe up", () => {
    render(<MiniPlayer />);
    down(region(), 120, 700);
    move(region(), 120, 650);
    move(region(), 120, 100);
    expect(useUI.getState().nowPlayingOpen).toBe(true);
    expect(sheetY.get()).toBe(travelPx() - 550);
    up(region(), 120, 100);
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("keeps a swipe up open when the browser cancels the pointer", () => {
    render(<MiniPlayer />);
    down(region(), 120, 700);
    move(region(), 120, 650);
    move(region(), 120, 100);
    fireEvent.pointerCancel(region(), at(120, 100));
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("ignores a short upward movement", () => {
    render(<MiniPlayer />);
    down(region(), 120, 500);
    up(region(), 120, 470);
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });

  it("ignores a downward swipe", () => {
    render(<MiniPlayer />);
    down(region(), 120, 400);
    up(region(), 120, 480);
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });

  it("skips to the next track on a swipe left", async () => {
    render(<MiniPlayer />);
    down(region(), 260, 500);
    move(region(), 160, 500);
    move(region(), 60, 500);
    up(region(), 60, 500);
    await waitFor(() => expect(usePlayer.getState().index).toBe(1));
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });

  it("skips to the previous track on a swipe right", async () => {
    usePlayer.setState({ index: 1 });
    render(<MiniPlayer />);
    down(region(), 100, 500);
    move(region(), 160, 500);
    move(region(), 260, 500);
    up(region(), 260, 500);
    await waitFor(() => expect(usePlayer.getState().index).toBe(0));
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });

  it("does not skip past the last track on a swipe left", () => {
    usePlayer.setState({ index: 1 });
    render(<MiniPlayer />);
    down(region(), 260, 500);
    move(region(), 160, 500);
    move(region(), 60, 500);
    up(region(), 60, 500);
    expect(usePlayer.getState().index).toBe(1);
  });

  it("draws progress from the player position", async () => {
    render(<MiniPlayer />);
    await waitFor(() => {
      const node = screen.getByRole("region", { name: "Mini player" }).querySelector("[data-progress-fill]");
      if (!node?.getAttribute("style")?.includes("scaleX(0.15)")) throw new Error("not yet");
    });
  });

  it("draws the played part in the accent colour over a faint track", () => {
    render(<MiniPlayer />);
    const fill = screen.getByRole("region", { name: "Mini player" }).querySelector("[data-progress-fill]");
    expect(fill?.className).toContain("bg-[rgb(var(--accent))]");
    expect(fill?.parentElement?.className).toContain("bg-separator");
  });

  it("shows a high-contrast 44px playback control in theme ink", () => {
    render(<MiniPlayer />);
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.className).toContain("size-11");
    expect(play.className).toContain("bg-ink-1");
    expect(play.className).toContain("text-surface");
    expect(play.className).not.toMatch(/bg-white|bg-primary/);
  });

  it("uses theme tokens for text so it follows light and dark themes", () => {
    render(<MiniPlayer />);
    const region = screen.getByRole("region", { name: "Mini player" });
    expect(region.className).toContain("text-ink-1");
    expect(region.className).not.toMatch(/#|text-white/);
    expect(screen.getByText("Track 1").className).toContain("text-ink-1");
    expect(screen.getByText("Artist 1").className).toContain("text-ink-2");
    expect(screen.getByRole("button", { name: "Play" }).querySelector("svg")?.getAttribute("width")).toBe("24");
  });

  it("shows the liked heart in the accent colour, not a hard-coded orange", () => {
    render(<MiniPlayer />);
    const like = screen.getByRole("button", { name: "Add to liked songs" });
    expect(like.className).toContain("text-ink-2");
    fireEvent.click(like);
    const liked = screen.getByRole("button", { name: "Remove from liked songs" });
    expect(liked.className).toContain("text-accent");
    expect(liked.className).not.toContain("#ff8a65");
  });

  it("draws a solid bar without a border", () => {
    render(<MiniPlayer />);
    const bar = screen.getByRole("region", { name: "Mini player" }).firstElementChild as HTMLElement;
    expect(bar.className).toContain("relative");
    expect(bar.className).toContain("overflow-hidden");
    expect(bar.className).not.toContain("border");
    expect(bar.style.height).toBe("64px");
  });
});
