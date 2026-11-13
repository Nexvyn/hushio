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
      "Download",
      "Lyrics",
      "Queue",
      "Sleep timer",
      "Cast",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.queryByLabelText(/nudge|timing/i)).toBeNull();
  });

  it("has exactly one more button, in the header", () => {
    render(<PhoneNowPlaying />);
    const more = screen.getAllByRole("button", { name: /more/i });
    expect(more).toHaveLength(1);
    expect(more[0].getAttribute("aria-label")).toBe("More options");
    expect(header().contains(more[0])).toBe(true);
  });

  it("shows --:-- for the duration when it is unknown and keeps the fill at zero", () => {
    usePlayer.setState({ duration: 0, position: 125 });
    render(<PhoneNowPlaying />);
    expect(screen.getByText("--:--")).toBeTruthy();
    const slider = screen.getByRole("slider", { name: "Seek" });
    expect(slider.querySelector("[style*='width: 0%']")).toBeTruthy();
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
    fireEvent.pointerUp(slider, { clientX: 150, clientY: 0 });
    expect(seekTo).toHaveBeenLastCalledWith(50);
  });

  it("seeks to where a drag ends, not only where it starts", () => {
    render(<PhoneNowPlaying />);
    const slider = screen.getByRole("slider", { name: "Seek" });
    slider.getBoundingClientRect = () =>
      ({ left: 100, width: 200, top: 0, right: 300, bottom: 0, height: 0, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(slider, { clientX: 150, clientY: 0 });
    fireEvent.pointerMove(slider, { clientX: 250, clientY: 0 });
    fireEvent.pointerUp(slider, { clientX: 250, clientY: 0 });
    expect(seekTo).toHaveBeenLastCalledWith(150);
  });

  it("toggles the lyrics page from the Lyrics button", () => {
    render(<PhoneNowPlaying />);
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Lyrics" }));
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Lyrics" }));
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("opens lyrics only from the Lyrics button, not from a swipe", () => {
    render(<PhoneNowPlaying />);
    const pages = screen.getByRole("group", { name: "Now playing pages" });
    fireEvent.pointerDown(pages, { clientX: 300, clientY: 300 });
    fireEvent(pages, createEvent.pointerUp(pages, { clientX: 200, clientY: 300 }));
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Lyrics" }));
    expect(screen.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("true");
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
    await waitFor(() => expect(useUI.getState().nowPlayingOpen).toBe(false));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Now playing" })).toBeNull());
  });

  it("stays open after a short, slow drag", () => {
    render(<PhoneNowPlaying />);
    pointer("pointerDown", header(), 100, 1000);
    pointer("pointerMove", header(), 150, 2000);
    pointer("pointerUp", header(), 150, 2000);
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("closes on a fast downward release even when short", async () => {
    render(<PhoneNowPlaying />);
    pointer("pointerDown", header(), 100, 1000);
    pointer("pointerMove", header(), 200, 1100);
    pointer("pointerUp", header(), 200, 1100);
    await waitFor(() => expect(useUI.getState().nowPlayingOpen).toBe(false));
  });

  it("puts the title on the left and the like and download buttons on the right of one row", () => {
    render(<PhoneNowPlaying />);
    const title = screen.getByText("Track 1");
    expect(title.className).toContain("text-[22px]");
    expect(title.className).toContain("font-bold");
    expect(title.className).toContain("truncate");
    const like = screen.getByRole("button", { name: "Like" });
    const download = screen.getByRole("button", { name: "Download" });
    const row = like.parentElement as HTMLElement;
    expect(row.contains(title)).toBe(true);
    expect(row.contains(download)).toBe(true);
    expect(row.lastElementChild).toBe(download);
    expect(Boolean(title.compareDocumentPosition(like) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("labels the four bottom actions by aria-label only, with no visible text", () => {
    render(<PhoneNowPlaying />);
    for (const name of ["Lyrics", "Queue", "Sleep timer", "Cast"]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-label")).toBe(name);
      expect(button.getAttribute("title")).toBe(name);
      expect(button.textContent).toBe("");
    }
  });

  it("keeps the flat artwork backdrop out when the track has no artwork", () => {
    render(<PhoneNowPlaying />);
    expect(document.querySelector("[data-ambient-backdrop]")).toBeNull();
  });
});
