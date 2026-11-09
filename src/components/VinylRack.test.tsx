import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getPlaybackPosition: vi.fn(() => 0),
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { VinylRack } from "./VinylRack";
import { usePlayer } from "../stores/player";
import { playStream } from "../lib/audio";

vi.mocked(playStream).mockResolvedValue(undefined);
import type { Track } from "../types";

const tracks: Track[] = ["a", "b", "c", "d", "e"].map((id) => ({
  id,
  title: `Song ${id}`,
  artist: "The Band",
  thumb: null,
}));

function setQueue(index: number, queue: Track[] = tracks) {
  usePlayer.setState({ queue, index, playing: false, position: 0, duration: 0 });
}

function group(): HTMLElement {
  return screen.getByRole("group", { name: "Now playing artwork, previous and next tracks" });
}

const realJumpTo = usePlayer.getState().jumpTo;

describe("VinylRack", () => {
  beforeEach(() => {
    usePlayer.setState({ jumpTo: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("reduce-motion");
  });

  it("renders two previous covers, the current one and one next when available", () => {
    setQueue(2);
    render(<VinylRack cover="cover.jpg" />);
    expect(screen.getByRole("button", { name: "Play previous: Song a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play previous: Song b" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play next: Song d" })).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(3);
  });

  it("renders only what exists at the ends of the queue", () => {
    setQueue(0, tracks.slice(0, 2));
    render(<VinylRack cover="" />);
    expect(screen.getByRole("button", { name: "Play next: Song b" })).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /previous/ })).toHaveLength(0);
  });

  it("calls the previous and next store actions from the side covers", () => {
    setQueue(2);
    render(<VinylRack cover="" />);
    fireEvent.click(screen.getByRole("button", { name: "Play previous: Song b" }));
    expect(usePlayer.getState().jumpTo).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Play next: Song d" }));
    expect(usePlayer.getState().jumpTo).toHaveBeenLastCalledWith(3);
  });

  it("changes track with the arrow keys", () => {
    setQueue(2);
    render(<VinylRack cover="" />);
    fireEvent.keyDown(group(), { key: "ArrowLeft" });
    expect(usePlayer.getState().jumpTo).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(usePlayer.getState().jumpTo).toHaveBeenLastCalledWith(3);
  });

  it("does nothing on arrow keys past the ends", () => {
    setQueue(0, tracks.slice(0, 1));
    render(<VinylRack cover="" />);
    fireEvent.keyDown(group(), { key: "ArrowLeft" });
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(usePlayer.getState().jumpTo).not.toHaveBeenCalled();
  });

  it("ignores pointer drags when reduced motion is on", () => {
    document.documentElement.classList.add("reduce-motion");
    setQueue(2);
    render(<VinylRack cover="" />);
    const rack = group();
    fireEvent(rack, new MouseEvent("pointerdown", { bubbles: true, clientX: 100, button: 0 }));
    fireEvent(rack, new MouseEvent("pointermove", { bubbles: true, clientX: 400 }));
    fireEvent(rack, new MouseEvent("pointerup", { bubbles: true, clientX: 400 }));
    expect(usePlayer.getState().jumpTo).not.toHaveBeenCalled();
    expect(usePlayer.getState().index).toBe(2);
  });

  it("plays the previous track from a side cover even past 3 seconds in", () => {
    setQueue(2);
    usePlayer.setState({ jumpTo: realJumpTo, position: 30 });
    render(<VinylRack cover="" />);
    fireEvent.click(screen.getByRole("button", { name: "Play previous: Song b" }));
    expect(usePlayer.getState().index).toBe(1);
    expect(playStream).toHaveBeenLastCalledWith("b", "Song b");
  });

  it("jumps straight to the outer previous track", () => {
    setQueue(2);
    usePlayer.setState({ jumpTo: realJumpTo });
    render(<VinylRack cover="" />);
    fireEvent.click(screen.getByRole("button", { name: "Play previous: Song a" }));
    expect(usePlayer.getState().index).toBe(0);
    expect(playStream).toHaveBeenLastCalledWith("a", "Song a");
  });
});

describe("VinylRack side labels and sizing", () => {
  beforeEach(() => {
    usePlayer.setState({ jumpTo: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("labels the previous and next side covers with their titles", () => {
    setQueue(2);
    render(<VinylRack cover="" />);
    expect(screen.getByText("Previous · Song b")).toBeTruthy();
    expect(screen.getByText("Up next · Song d")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play next: Song d" })).toBeTruthy();
  });

  it("renders no side label or fragment where no neighbour exists", () => {
    setQueue(0, tracks.slice(0, 1));
    render(<VinylRack cover="" />);
    expect(screen.queryByText(/Previous ·|Up next ·/)).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("hides side covers that would be under 96px in a narrow container", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 200 } as DOMRect);
    setQueue(2);
    render(<VinylRack cover="" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(group()).toBeTruthy();
  });
});
