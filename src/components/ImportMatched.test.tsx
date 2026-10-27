import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SearchSong } from "../lib/searchParse";

const { matchSong } = vi.hoisted(() => ({ matchSong: vi.fn() }));

vi.mock("../lib/importMatch", () => ({ matchSong }));
vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

import { ImportMatched } from "./ImportMatched";
import { stageImport } from "../lib/importStage";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const initialLibrary = useLibrary.getState();

function found(id: string, title: string): SearchSong {
  return {
    id,
    title,
    artist: "Band",
    thumb: null,
    album: null,
    duration: 180,
    explicit: false,
    isVideo: false,
    artistId: null,
    albumId: null,
  };
}

beforeEach(() => {
  cleanup();
  matchSong.mockReset();
  useLibrary.setState(initialLibrary, true);
  useNavigation.setState({ view: { name: "import" }, navPast: [], navFuture: [] });
  useUI.setState({ toasts: [], pendingToasts: [] });
});

describe("ImportMatched", () => {
  it("reports a missing import", () => {
    render(<ImportMatched importId="import-does-not-exist" />);
    expect(screen.getByText("Nothing to import")).toBeTruthy();
  });

  it("says when the playlist has no songs", () => {
    const id = stageImport({ name: "Empty", songs: [], total: 0, fromSpotify: false });
    render(<ImportMatched importId={id} />);
    expect(screen.getByText("This playlist has no songs yet.")).toBeTruthy();
  });

  it("shows the matching summary, the missing songs and saves the matched ones", async () => {
    const user = userEvent.setup();
    matchSong.mockImplementation(async (item: { title: string }) => {
      if (item.title === "Levitating") return found("lev", "Levitating");
      if (item.title === "Ghost") return null;
      return found("ok", "Second");
    });
    const id = stageImport({
      name: "Mix",
      songs: [
        { title: "Levitating", artist: "Dua Lipa", duration: 203 },
        { title: "Ghost", artist: "Nobody", duration: 0 },
        { title: "Second", artist: "Band", duration: 0 },
      ],
      total: 3,
      fromSpotify: false,
    });
    render(<ImportMatched importId={id} />);

    expect(await screen.findByText("2 of 3 songs found on YouTube Music. 1 isn't there.")).toBeTruthy();
    expect(screen.getByText("Not on YouTube Music")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save to library" }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "Save to library" }));
    const view = useNavigation.getState().view;
    expect(view.name).toBe("playlist");
    const saved = useLibrary.getState().playlists.find((item) => item.id === view.param);
    expect(saved?.tracks.map((track) => track.id)).toEqual(["lev", "ok"]);
    expect(useUI.getState().toasts.map((toast) => toast.message)).toContain("Saved “Mix” to your library");
  });

  it("offers to try again for songs that could not be checked", async () => {
    const user = userEvent.setup();
    matchSong.mockRejectedValueOnce(new Error("network"));
    matchSong.mockResolvedValue(null);
    const id = stageImport({
      name: "Flaky",
      songs: [{ title: "Flaky one", artist: "A", duration: 0 }],
      total: 1,
      fromSpotify: false,
    });
    render(<ImportMatched importId={id} />);

    expect(await screen.findByText("0 of 1 songs found on YouTube Music. 1 couldn't be checked.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("0 of 1 songs found on YouTube Music. 1 isn't there.")).toBeTruthy();
    expect(matchSong).toHaveBeenCalledTimes(2);
  });

  it("shows the cut notice when the source had more songs than were read", () => {
    const id = stageImport({
      name: "Big",
      songs: [{ title: "One", artist: "A", duration: 0 }],
      total: 40,
      fromSpotify: true,
    });
    matchSong.mockReturnValue(new Promise(() => {}));
    render(<ImportMatched importId={id} />);
    expect(screen.getByText("The playlist has 40 songs; Hushio could read the first 1.")).toBeTruthy();
  });
});
