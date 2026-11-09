import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("../../lib/useTrackLyrics", () => ({ useTrackLyrics: () => ({ lyrics: null, loading: false }) }));
vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PhoneNowPlaying } from "./PhoneNowPlaying";
import { usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });

function pointer(type: "pointerDown" | "pointerMove" | "pointerUp", target: Element, clientY: number, time: number) {
  const event = createEvent[type](target, { clientX: 120, clientY });
  Object.defineProperty(event, "timeStamp", { value: time });
  fireEvent(target, event);
}

function header(): HTMLElement {
  return screen.getByRole("dialog", { name: "Now playing" }).querySelector("header") as HTMLElement;
}

beforeEach(() => {
  usePlayer.setState({ queue: [track(1), track(2)], index: 0, playing: false, buffering: false, position: 50, duration: 200 });
  useUI.setState({ nowPlayingOpen: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PhoneNowPlaying", () => {
  it("renders nothing when closed", () => {
    useUI.setState({ nowPlayingOpen: false });
    render(<PhoneNowPlaying />);
    expect(screen.queryByRole("dialog", { name: "Now playing" })).toBeNull();
  });

  it("shows the transport and secondary controls and no timing nudge", () => {
    render(<PhoneNowPlaying />);
    expect(screen.getByRole("dialog", { name: "Now playing" })).toBeTruthy();
    for (const name of [
      "Enable shuffle",
      "Previous",
      "Play",
      "Next",
      "Enable repeat",
      "Like",
      "Lyrics",
      "Sleep timer",
      "More",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.queryByLabelText(/nudge|timing/i)).toBeNull();
  });

  it("closes from the down chevron", async () => {
    render(<PhoneNowPlaying />);
    fireEvent.click(screen.getByRole("button", { name: "Close Now Playing" }));
    expect(useUI.getState().nowPlayingOpen).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Now playing" })).toBeNull());
  });

  it("seeks to the tapped point of the seek bar", () => {
    render(<PhoneNowPlaying />);
    const slider = screen.getByRole("slider", { name: "Seek" });
    slider.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, right: 300, bottom: 0, height: 0, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(slider, { clientX: 150, clientY: 0 });
    expect(seekTo).toHaveBeenLastCalledWith(50);
  });

  it("toggles the lyrics page from the Lyrics button", () => {
    render(<PhoneNowPlaying />);
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Lyrics" }));
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Lyrics" }));
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("swipes left for lyrics and right back to the artwork", () => {
    render(<PhoneNowPlaying />);
    const pages = screen.getByRole("group", { name: "Now playing pages" });
    fireEvent.pointerDown(pages, { clientX: 300, clientY: 300 });
    fireEvent(pages, createEvent.pointerUp(pages, { clientX: 200, clientY: 300 }));
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.pointerDown(pages, { clientX: 200, clientY: 300 });
    fireEvent(pages, createEvent.pointerUp(pages, { clientX: 320, clientY: 300 }));
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("does not skip the track on a swipe over the artwork", () => {
    render(<PhoneNowPlaying />);
    const pages = screen.getByRole("group", { name: "Now playing pages" });
    fireEvent.pointerDown(pages, { clientX: 300, clientY: 300 });
    fireEvent(pages, createEvent.pointerUp(pages, { clientX: 100, clientY: 300 }));
    expect(usePlayer.getState().index).toBe(0);
  });

  it("follows a downward drag from the header and closes past 40%", async () => {
    render(<PhoneNowPlaying />);
    pointer("pointerDown", header(), 100, 1000);
    pointer("pointerMove", header(), 520, 2000);
    pointer("pointerUp", header(), 520, 2000);
    expect(useUI.getState().nowPlayingOpen).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Now playing" })).toBeNull());
  });

  it("stays open after a short, slow drag", () => {
    render(<PhoneNowPlaying />);
    pointer("pointerDown", header(), 100, 1000);
    pointer("pointerMove", header(), 150, 2000);
    pointer("pointerUp", header(), 150, 2000);
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("closes on a fast downward release even when short", () => {
    render(<PhoneNowPlaying />);
    pointer("pointerDown", header(), 100, 1000);
    pointer("pointerMove", header(), 200, 1100);
    pointer("pointerUp", header(), 200, 1100);
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });
});
