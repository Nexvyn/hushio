import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { queueName } from "../lib/collectionActions";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();
const initialLibrary = useLibrary.getState();

function renderQueue() {
  useUI.setState({ rightPanel: "queue" });
  render(<RightRail />);
}

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useUI.setState(initialUI, true);
  useLibrary.setState(initialLibrary, true);
});

afterEach(cleanup);

describe("RightRail", () => {
  it("shows the nothing-playing state on the now-playing view", () => {
    render(<RightRail />);

    expect(screen.getByText("Play something and it shows up here.")).toBeTruthy();
    expect(screen.getByText("Now playing")).toBeTruthy();
  });

  it("shows the cover and title, then the queue with every upcoming song", () => {
    usePlayer.getState().playQueue([track(0), track(1), track(2), track(3)], 1, "__liked__");
    render(<RightRail />);

    const rail = screen.getByLabelText("Now playing panel");
    const title = within(rail).getByText("Track 1");
    const heading = within(rail).getByRole("heading", { name: "Next from: Liked Songs" });
    const queue = within(screen.getByRole("region", { name: "Queue" }));
    expect(title.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(queue.getByRole("button", { name: /Track 2/ })).toBeTruthy();
    expect(queue.getByRole("button", { name: /Track 3/ })).toBeTruthy();
    expect(queue.queryByText("Track 1")).toBeNull();
    expect(within(rail).getByRole("button", { name: "Clear queue" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "About the artist" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Next in queue" })).toBeNull();
  });

  it("titles the header with the playlist or liked songs the playing song comes from", () => {
    usePlayer.getState().playQueue([track(0), track(1)], 0, "__liked__");
    render(<RightRail />);

    expect(screen.getByText("Liked Songs")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Track options" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close panel" })).toBeTruthy();
  });

  it("titles the header Now playing instead of repeating the track title when no context is set", () => {
    usePlayer.getState().playQueue([track(0), track(1)], 1);
    render(<RightRail />);

    const header = screen.getByRole("button", { name: "Track options" }).closest("header") as HTMLElement;
    expect(within(header).getByText("Now playing")).toBeTruthy();
    expect(within(header).queryByText("Track 1")).toBeNull();
    expect(screen.queryByText("Playing from")).toBeNull();
  });

  it("opens the track menu with Add to queue and Download", async () => {
    usePlayer.getState().playQueue([track(0), track(1)], 0);
    const user = userEvent.setup();
    render(<RightRail />);

    await user.click(screen.getByRole("button", { name: "Track options" }));
    const labels = useUI.getState().contextMenu?.items.map((item) => item.label) ?? [];
    expect(labels).toContain("Add to queue");
    expect(labels).toContain("Download");
  });

  it("closes the rail from the close button", async () => {
    usePlayer.getState().playQueue([track(0), track(1)], 0);
    const user = userEvent.setup();
    render(<RightRail />);

    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(useUI.getState().railColumnOpen).toBe(false);
  });

  it("switches between the queue and recently played tabs", async () => {
    usePlayer.getState().playQueue([track(0), track(1), track(2)], 0);
    const user = userEvent.setup();
    renderQueue();

    expect(screen.getByRole("region", { name: "Queue" })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Recently played" }));
    expect(screen.queryByRole("region", { name: "Queue" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Recently played" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Recently played" }).getAttribute("aria-selected")).toBe("true");
  });

  it("lists the upcoming songs and plays one when its row is clicked", async () => {
    usePlayer.getState().playQueue([track(0), track(1), track(2), track(3)], 0);
    const user = userEvent.setup();
    renderQueue();

    const queue = screen.getByRole("region", { name: "Queue" });
    expect(within(queue).queryByText("Track 0")).toBeNull();

    await user.click(within(queue).getByRole("button", { name: /Track 2/ }));
    expect(usePlayer.getState().index).toBe(2);
  });

  it("saves the playing song and the rest of the queue as a playlist", async () => {
    useLibrary.setState({ playlists: [] });
    usePlayer.getState().playQueue([track(0), track(1), track(2)], 1);
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: "Save as playlist" }));

    const saved = useLibrary.getState().playlists[0];
    expect(saved.name).toBe(queueName());
    expect(saved.tracks.map((item) => item.id)).toEqual(["t1", "t2"]);
    expect(useUI.getState().toasts.at(-1)?.message).toBe(`Saved as ${queueName()}`);
  });

  it("removes an upcoming song from the queue list", async () => {
    usePlayer.getState().playQueue([track(0), track(1), track(2)], 0);
    const user = userEvent.setup();
    renderQueue();

    const removeButtons = screen.getAllByRole("button", { name: "Remove from queue" });
    await user.click(removeButtons[0]);

    await waitFor(() => expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["t0", "t2"]));
  });

  it("moves the focused upcoming song with Alt+Arrow keys and keeps the first song in place", async () => {
    usePlayer.getState().playQueue([track(0), track(1), track(2), track(3)], 0);
    const moveUpcoming = vi.fn();
    usePlayer.setState({ moveUpcoming });
    renderQueue();

    const queue = within(screen.getByRole("region", { name: "Queue" }));
    const second = queue.getByRole("button", { name: /Track 2/ });
    fireEvent.keyDown(second, { key: "ArrowDown", altKey: true });
    expect(moveUpcoming).toHaveBeenLastCalledWith(2, 3);

    fireEvent.keyDown(second, { key: "ArrowUp", altKey: true });
    expect(moveUpcoming).toHaveBeenLastCalledWith(2, 1);

    fireEvent.keyDown(queue.getByRole("button", { name: /Track 1/ }), { key: "ArrowUp", altKey: true });
    expect(moveUpcoming).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(second, { key: "ArrowDown" });
    expect(moveUpcoming).toHaveBeenCalledTimes(2);
  });

  it("shows recently played songs on their tab, without the playing one", async () => {
    const player = usePlayer.getState();
    player.playQueue([track(0), track(1)], 0);
    player.jumpTo(1);
    renderQueue();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Recently played" }));

    const recent = screen.getByRole("heading", { name: "Recently played" }).closest("section");
    expect(within(recent as HTMLElement).getByRole("button", { name: /Track 0/ })).toBeTruthy();
    expect(within(recent as HTMLElement).queryByRole("button", { name: /Track 1/ })).toBeNull();
  });
});
