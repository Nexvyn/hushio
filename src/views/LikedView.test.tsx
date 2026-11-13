import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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

import { LikedView } from "./LikedView";
import { fmtTotal } from "../lib/format";
import { type LibraryTrack, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const liked = (i: number, artist: string, duration: number): LibraryTrack => ({
  id: `t${i}`,
  title: `Track ${i}`,
  artist,
  thumb: null,
  album: "Album",
  duration,
  explicit: false,
});

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialNavigation = useNavigation.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useNavigation.setState(initialNavigation, true);
});

afterEach(cleanup);

describe("Liked Songs with nothing liked", () => {
  it("shows the empty state and disables the play controls", () => {
    render(<LikedView />);

    expect(screen.getByText("No liked songs yet")).toBeTruthy();
    expect(screen.getByText("No liked songs yet").closest("section")?.className).toContain("place-items-center");
    expect((screen.getByRole("button", { name: "Play Liked Songs" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Shuffle" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens search from the empty state button", () => {
    render(<LikedView />);

    fireEvent.click(screen.getByRole("button", { name: "Find songs" }));
    expect(useNavigation.getState().view).toEqual({ name: "search" });
  });
});

describe("Liked Songs with songs", () => {
  beforeEach(() => {
    useLibrary.setState({
      liked: [liked(1, "Artist A", 600), liked(2, "Artist B", 1200), liked(3, "Artist A", 0)],
    });
  });

  it("shows the count, total length and the most liked artist", () => {
    render(<LikedView />);

    expect(screen.getByRole("heading", { name: "Liked Songs" })).toBeTruthy();
    expect(screen.getByText("3 songs · 30 min · Your most liked:", { exact: false })).toBeTruthy();
    expect(screen.getByText("Artist A", { selector: "span.font-semibold" })).toBeTruthy();
    expect(screen.queryByText("No liked songs yet")).toBeNull();
  });

  it("lists every liked song in order", () => {
    render(<LikedView />);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Track 2")).toBeTruthy();
  });

  it("plays the whole list from the first song", () => {
    render(<LikedView />);

    fireEvent.click(screen.getByRole("button", { name: "Play Liked Songs" }));
    expect(usePlayer.getState().playingFrom).toBe("__liked__");
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["t1", "t2", "t3"]);
    expect(usePlayer.getState().index).toBe(0);
  });

  it("starts from a clicked row", () => {
    render(<LikedView />);

    fireEvent.click(screen.getByText("Track 2"));
    expect(usePlayer.getState().index).toBe(1);
    expect(usePlayer.getState().playingFrom).toBe("__liked__");
  });

  it("turns shuffle on and starts the list from a song", () => {
    render(<LikedView />);

    fireEvent.click(screen.getByRole("button", { name: "Shuffle" }));
    expect(usePlayer.getState().shuffle).toBe(true);
    expect(usePlayer.getState().playingFrom).toBe("__liked__");
    expect(usePlayer.getState().queue).toHaveLength(3);
  });

  it("removes a song from Liked Songs with its row like button", () => {
    render(<LikedView />);

    const rowLike = within(screen.getByText("Track 1").closest("li") as HTMLElement).getByRole("button", {
      name: "Like",
    });
    fireEvent.click(rowLike);
    expect(useLibrary.getState().liked.map((item) => item.id)).toEqual(["t2", "t3"]);
  });
});

describe("fmtTotal", () => {
  it.each([
    [0, "0 min"],
    [1800, "30 min"],
    [3600, "1 hr"],
    [5400, "1 hr 30 min"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(fmtTotal(seconds)).toBe(expected);
  });
});
