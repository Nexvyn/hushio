import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Track } from "../../types";

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
vi.mock("../../views/CurrentView", () => ({
  CurrentView: ({ view }: { view: { name: string } }) => <p>Screen {view.name}</p>,
}));
vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PhoneShell } from "./PhoneShell";
import { useNavigation } from "../../stores/navigation";
import { usePlayer } from "../../stores/player";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });

beforeEach(() => {
  useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [], pendingScroll: null });
  usePlayer.setState({ queue: [], index: 0, playing: false, position: 0, duration: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PhoneShell", () => {
  it("shows the current screen above the tab bar", () => {
    render(<PhoneShell />);
    expect(screen.getByText("Screen home")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("hides the mini player when nothing is loaded", () => {
    render(<PhoneShell />);
    expect(screen.queryByRole("region", { name: "Mini player" })).toBeNull();
  });

  it("shows the mini player once an item is loaded", () => {
    usePlayer.setState({ queue: [track(1)], index: 0 });
    render(<PhoneShell />);
    expect(screen.getByRole("region", { name: "Mini player" })).toBeTruthy();
  });

  it("changes the screen when a tab is tapped", () => {
    render(<PhoneShell />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByText("Screen search")).toBeTruthy();
    expect(screen.queryByText("Screen home")).toBeNull();
  });
});
