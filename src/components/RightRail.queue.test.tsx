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
import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useSongInfo } from "../stores/songInfo";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const track = (id: string, extra: Partial<Track> = {}): Track => ({ id, title: `Track ${id}`, artist: `Artist ${id}`, thumb: null, ...extra });
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();
const initialLibrary = useLibrary.getState();

function renderQueue() {
  useUI.setState({ rightPanel: "queue" });
  render(<RightRail />);
}

function headings(): string[] {
  return Array.from(screen.getByRole("region", { name: "Queue" }).querySelectorAll("h3")).map((node) => node.textContent ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useUI.setState(initialUI, true);
  useLibrary.setState(initialLibrary, true);
  useSongInfo.setState({ song: null });
});

afterEach(cleanup);

describe("queue grouping", () => {
  it("shows the playing song under Now playing, outside the upcoming list", () => {
    usePlayer.getState().playQueue([track("0"), track("1")], 0);
    renderQueue();

    const now = screen.getByRole("region", { name: "Now playing" });
    expect(within(now).getByText("Track 0")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Queue" })).queryByText("Track 0")).toBeNull();
  });

  it("groups user-queued songs, context songs and the autoplay tail under their headings", () => {
    usePlayer.getState().playQueue([track("0"), track("1"), track("2"), track("3"), track("4")], 0, "__liked__");
    usePlayer.getState().addToQueue([track("q")]);
    usePlayer.setState({ autoplayCount: 1 });
    renderQueue();

    expect(headings()).toEqual(["Next in queue", "Next from: Liked Songs", "Autoplay"]);
  });

  it("names the context Up next when the playing song has no source", () => {
    usePlayer.getState().playQueue([track("0"), track("1")], 0);
    renderQueue();

    expect(headings()).toEqual(["Up next"]);
  });

  it("captions smart-shuffle picks with Recommended", () => {
    usePlayer.getState().playQueue([track("0"), track("1"), track("2", { recommended: true })], 0);
    renderQueue();

    const queue = screen.getByRole("region", { name: "Queue" });
    expect(within(queue).getAllByText("Recommended")).toHaveLength(1);
    expect(within(queue).getByText("Track 2").closest("li")?.textContent).toContain("Recommended");
    expect(within(queue).getByText("Track 1").closest("li")?.textContent).not.toContain("Recommended");
  });

  it("marks a song moved into Next in queue as user-queued", () => {
    usePlayer.getState().playQueue([track("0"), track("1"), track("2"), track("3")], 0, "__liked__");
    usePlayer.getState().addToQueue([track("q")]);
    renderQueue();

    fireEvent.keyDown(within(screen.getByRole("region", { name: "Queue" })).getByRole("button", { name: /Track 2/ }), {
      key: "ArrowUp",
      altKey: true,
    });

    expect(usePlayer.getState().queue.filter((item) => item.queued).map((item) => item.id)).toEqual(["q", "2"]);
    expect(headings()).toEqual(["Next in queue", "Next from: Liked Songs"]);
  });
});

describe("right rail header and credits", () => {
  it("opens the full Now Playing view from the Expand button", async () => {
    usePlayer.getState().playQueue([track("0"), track("1")], 0);
    const user = userEvent.setup();
    render(<RightRail />);

    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("leaves credits out of the rail", () => {
    usePlayer.getState().playQueue([track("0"), track("1")], 1);
    render(<RightRail />);
    expect(screen.queryByRole("region", { name: "Credits" })).toBeNull();
  });
});

describe("queue layout", () => {
  it("shows Clear queue on the first heading line and Save as playlist beside it", () => {
    usePlayer.getState().playQueue([track("0"), track("1"), track("2")], 0, "__liked__");
    renderQueue();

    const queue = screen.getByRole("region", { name: "Queue" });
    const heading = within(queue).getByRole("heading", { name: "Next from: Liked Songs", level: 3 });
    const line = heading.parentElement as HTMLElement;
    expect(within(line).getByRole("button", { name: "Clear queue" })).toBeTruthy();
    expect(within(line).getByRole("button", { name: "Save as playlist" })).toBeTruthy();
  });

  it("clears the upcoming songs from the Clear queue link", async () => {
    usePlayer.getState().playQueue([track("0"), track("1"), track("2")], 0);
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: "Clear queue" }));
    await waitFor(() => expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["0"]));
  });

  it("clears the queue at once and shows the empty state", async () => {
    usePlayer.getState().playQueue([track("0"), track("1"), track("2"), track("3")], 0);
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: "Clear queue" }));
    expect(screen.getByText("Nothing queued")).toBeTruthy();
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["0"]);
  });

  it("hides Expand in queue mode and keeps the close button", () => {
    usePlayer.getState().playQueue([track("0"), track("1")], 0);
    renderQueue();

    expect(screen.queryByRole("button", { name: "Expand" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close panel" })).toBeTruthy();
  });

  it("keeps the remove button hidden until the row is hovered or focused", () => {
    usePlayer.getState().playQueue([track("0"), track("1")], 0);
    renderQueue();

    const row = screen.getByRole("region", { name: "Queue" }).querySelector("li[data-queue-at]") as HTMLElement;
    expect(row.className).toContain("group");
    expect(row.className).not.toContain("after:");
    const remove = within(row).getByRole("button", { name: "Remove from queue" });
    expect(remove.className).toContain("group-hover:opacity-100");
    expect(remove.className).toContain("group-focus-within:opacity-100");
  });

  it("puts a Clear link on the Recently played heading line", async () => {
    usePlayer.getState().playQueue([track("0"), track("1")], 0);
    usePlayer.getState().jumpTo(1);
    const user = userEvent.setup();
    renderQueue();
    await user.click(screen.getByRole("tab", { name: "Recently played" }));

    const heading = screen.getByRole("heading", { name: "Recently played" });
    const line = heading.parentElement as HTMLElement;
    expect(within(line).getByRole("button", { name: "Clear recently played" })).toBeTruthy();
  });
});

describe("queue removal", () => {
  it("removes a queued row at once", async () => {
    usePlayer.getState().playQueue([track("0"), track("1"), track("2")], 0);
    const user = userEvent.setup();
    renderQueue();

    await user.click(within(screen.getByRole("region", { name: "Queue" })).getAllByRole("button", { name: "Remove from queue" })[0]);
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["0", "2"]);
  });
});
