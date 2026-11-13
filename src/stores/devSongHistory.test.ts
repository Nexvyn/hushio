import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { TEST_SONG_ID } from "../lib/devSong";
import { isTestSong } from "../lib/devSong";
import { useLibrary } from "./library";
import { useRecentItems } from "./recents";

const testTrack = { id: TEST_SONG_ID, title: "Test song", artist: "Test", thumb: null };
const realTrack = { id: "real-1", title: "Real", artist: "Band", thumb: null };

describe("test song stays out of history and recents", () => {
  beforeEach(() => {
    useLibrary.setState({ history: [] });
    useRecentItems.setState({ items: [] });
  });

  it("recognises only the dev song id", () => {
    expect(isTestSong(TEST_SONG_ID)).toBe(true);
    expect(isTestSong("real-1")).toBe(false);
  });

  it("does not record the test song in play history", () => {
    useLibrary.getState().pushHistory(testTrack);
    useLibrary.getState().pushHistory(realTrack);
    expect(useLibrary.getState().history.map((track) => track.id)).toEqual(["real-1"]);
  });

  it("does not add the test song to recent items", () => {
    useRecentItems.getState().add({ kind: "song", id: TEST_SONG_ID, title: "Test song", subtitle: "Test", thumb: null });
    expect(useRecentItems.getState().items).toEqual([]);
  });
});
