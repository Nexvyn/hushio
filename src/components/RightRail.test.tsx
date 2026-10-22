import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

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

import { RightRail } from "./RightRail";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useUI.setState(initialUI, true);
});

afterEach(cleanup);

describe("RightRail", () => {
  it("shows the song details tab with nothing playing", () => {
    render(<RightRail />);

    expect(screen.getByRole("tab", { name: "Song details", selected: true })).toBeTruthy();
    expect(screen.getByText("Nothing playing yet")).toBeTruthy();
  });

  it("shows the playing song in the details tab", () => {
    usePlayer.getState().playQueue([track(0), track(1)], 1);
    render(<RightRail />);

    expect(screen.getByText("Track 1")).toBeTruthy();
    expect(screen.getByText("Artist 1")).toBeTruthy();
  });

  it("lists the upcoming songs and plays one when its row is clicked", async () => {
    usePlayer.getState().playQueue([track(0), track(1), track(2), track(3)], 0);
    const user = userEvent.setup();
    render(<RightRail />);

    await user.click(screen.getByRole("tab", { name: "Queue" }));
    const queue = screen.getByRole("tabpanel");
    expect(within(queue).queryByText("Track 0")).toBeNull();

    await user.click(within(queue).getByRole("button", { name: /Track 2/ }));
    expect(usePlayer.getState().index).toBe(2);
    expect(useUI.getState().rightPanel).toBe("queue");
  });

  it("removes an upcoming song from the queue list", async () => {
    usePlayer.getState().playQueue([track(0), track(1), track(2)], 0);
    const user = userEvent.setup();
    render(<RightRail />);

    await user.click(screen.getByRole("tab", { name: "Queue" }));
    const removeButtons = screen.getAllByRole("button", { name: "Remove from queue" });
    await user.click(removeButtons[0]);

    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["t0", "t2"]);
  });

  it("shows recently played songs under the queue, without the playing one", async () => {
    const player = usePlayer.getState();
    player.playQueue([track(0), track(1)], 0);
    player.jumpTo(1);
    render(<RightRail />);

    await userEvent.setup().click(screen.getByRole("tab", { name: "Queue" }));
    const recent = screen.getByRole("heading", { name: "Recently played" }).closest("section");
    expect(within(recent as HTMLElement).getByRole("button", { name: /Track 0/ })).toBeTruthy();
    expect(within(recent as HTMLElement).queryByRole("button", { name: /Track 1/ })).toBeNull();
  });
});
