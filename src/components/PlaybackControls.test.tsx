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

import { PlaybackControls } from "./PlaybackControls";
import { usePlayer } from "../stores/player";

const track = { id: "pc-1", title: "Blue Song", artist: "The Band", thumb: null };

describe("PlaybackControls", () => {
  beforeEach(() => {
    usePlayer.setState({ queue: [track], index: 0, position: 0, duration: 200, playing: false, shuffle: false, repeat: "off" });
  });

  afterEach(() => {
    cleanup();
  });

  it("labels every control and offers Play while paused", () => {
    render(<PlaybackControls />);
    expect(screen.getByRole("group", { name: "Playback" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Shuffle off" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable repeat" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers Pause while playing", () => {
    usePlayer.setState({ playing: true });
    render(<PlaybackControls />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("shows shuffle as pressed with an accent dot and cycles to smart shuffle and off", () => {
    usePlayer.setState({ shuffle: true });
    const { container } = render(<PlaybackControls />);
    const shuffle = screen.getByRole("button", { name: "Shuffle on" });
    expect(shuffle.getAttribute("aria-pressed")).toBe("true");
    expect(shuffle.querySelector("span.bg-accent")).not.toBeNull();
    expect(container.querySelectorAll("span.bg-accent")).toHaveLength(1);
    fireEvent.click(shuffle);
    expect(usePlayer.getState().smartShuffle).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Smart shuffle on" }));
    expect(usePlayer.getState().shuffle).toBe(false);
  });

  it("cycles repeat through all, one and off with matching labels", () => {
    render(<PlaybackControls />);
    fireEvent.click(screen.getByRole("button", { name: "Enable repeat" }));
    expect(usePlayer.getState().repeat).toBe("all");
    fireEvent.click(screen.getByRole("button", { name: "Disable repeat" }));
    expect(usePlayer.getState().repeat).toBe("one");
    expect(screen.getByRole("button", { name: "Disable repeat one" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("disables previous and next with an empty queue", () => {
    usePlayer.setState({ queue: [], index: 0 });
    render(<PlaybackControls />);
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
