import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../types";

const { playQueue, toast, getArtistBundle, getAlbumPage, getPlaylistPage } = vi.hoisted(() => ({
  playQueue: vi.fn(),
  toast: vi.fn(),
  getArtistBundle: vi.fn(),
  getAlbumPage: vi.fn(),
  getPlaylistPage: vi.fn(),
}));

vi.mock("../stores/player", () => ({ usePlayer: { getState: () => ({ playQueue }) } }));
vi.mock("../stores/ui", () => ({ useUI: { getState: () => ({ toast }) } }));
vi.mock("./artistBundle", () => ({ getArtistBundle }));
vi.mock("./browse", () => ({ getAlbumPage, getPlaylistPage }));

import { startPlaySource } from "./playSource";

const track = (id: string): Track => ({ id, title: `Song ${id}`, artist: "Alpha", thumb: null });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startPlaySource", () => {
  it("starts a card's full queue from its first song and names it after the card", async () => {
    getArtistBundle.mockResolvedValue({
      artistId: "UC-a",
      name: "Alpha",
      thumb: null,
      topSongs: [track("s1"), track("s2"), track("s1")],
      albums: [],
      related: [],
      fetchedAt: 0,
    });

    await startPlaySource({ type: "artist-mix", artistId: "UC-a", name: "Alpha Mix" });

    expect(toast).toHaveBeenCalledWith("Loading Alpha Mix…");
    expect(playQueue).toHaveBeenCalledTimes(1);
    const [tracks, index, from] = playQueue.mock.calls[0];
    expect((tracks as Track[]).map((item) => item.id).sort()).toEqual(["s1", "s2"]);
    expect(index).toBe(0);
    expect(from).toBe("Alpha Mix");
  });

  it("plays a side's tracks without a loading toast", async () => {
    await startPlaySource({ type: "tracks", tracks: [track("a"), track("b")], label: "Side A" });

    expect(toast).not.toHaveBeenCalled();
    expect(playQueue).toHaveBeenCalledWith([track("a"), track("b")], 0, "Side A");
  });

  it("shows a build error and plays nothing when the card has no songs", async () => {
    getArtistBundle.mockResolvedValue(null);

    await startPlaySource({ type: "artist-radio", artistId: "UC-x", name: "X Radio" });

    expect(toast).toHaveBeenLastCalledWith('Couldn\'t build "X Radio" right now', "error");
    expect(playQueue).not.toHaveBeenCalled();
  });

  it("shows a playback error when loading fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getAlbumPage.mockRejectedValue(new Error("offline"));

    await startPlaySource({ type: "album", albumId: "MPRE1", name: "Album" });

    expect(toast).toHaveBeenLastCalledWith("Couldn't play that right now", "error");
    expect(playQueue).not.toHaveBeenCalled();
  });
});
