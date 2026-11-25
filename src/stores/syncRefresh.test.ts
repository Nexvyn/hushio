import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const bridge = vi.hoisted(() => ({
  myPlaylists: vi.fn(),
  playlistVideos: vi.fn(),
  unlink: vi.fn(async () => {}),
  enqueue: vi.fn(async () => {}),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  ytMyPlaylists: bridge.myPlaylists,
  ytPlaylistVideos: bridge.playlistVideos,
  ytUnlinkPlaylist: bridge.unlink,
  ytEnqueue: bridge.enqueue,
}));

import { GUEST_ACCOUNT, useAuth } from "./auth";
import { useLibrary } from "./library";
import { refreshStaleYtPlaylists } from "./sync";
import { useUI } from "./ui";

const initialLibrary = useLibrary.getState();
const LATER = Date.now() + 7 * 60 * 60 * 1000;
const DELETED = "This playlist was deleted on YouTube. Kept a copy here.";

const video = (id: string) => ({ videoId: id, title: id, artist: "Artist", durationSeconds: 100, thumbnail: null });
const song = (id: string) => ({ id, title: id, artist: "Artist", thumb: null, duration: 100 });
const messages = () => useUI.getState().toasts.map((toast) => toast.message);
const playlistOf = (id: string) => useLibrary.getState().playlists.find((playlist) => playlist.id === id);

beforeEach(() => {
  vi.clearAllMocks();
  useLibrary.setState(initialLibrary, true);
  useUI.setState({ toasts: [], pendingToasts: [] });
  useAuth.setState({ account: { ...GUEST_ACCOUNT, mode: "google" } });
});

describe("refreshing linked YouTube playlists", () => {
  it("unlinks a playlist that is gone from YouTube and keeps its songs", async () => {
    useLibrary.getState().importLinkedPlaylist("local-1", "Road", "PL9", [song("dQw4w9WgXcQ")]);
    bridge.myPlaylists.mockResolvedValue([]);

    await refreshStaleYtPlaylists(LATER);

    expect(playlistOf("local-1")?.remote).toBeUndefined();
    expect(playlistOf("local-1")?.tracks.map((track) => track.id)).toEqual(["dQw4w9WgXcQ"]);
    expect(bridge.unlink).toHaveBeenCalledWith("local-1");
    expect(bridge.playlistVideos).not.toHaveBeenCalled();
    expect(messages()).toContain(DELETED);
  });

  it("pulls YouTube changes but keeps a song added locally that is still queued", async () => {
    useLibrary.getState().importLinkedPlaylist("local-1", "Road", "PL1", [song("dQw4w9WgXcQ")]);
    useLibrary.getState().addToPlaylist("local-1", song("aaaaaaaaaaa"));
    bridge.myPlaylists.mockResolvedValue([{ id: "PL1", title: "Road", count: 1, thumbnail: null }]);
    bridge.playlistVideos.mockResolvedValue([video("dQw4w9WgXcQ")]);

    await refreshStaleYtPlaylists(LATER);

    expect(bridge.playlistVideos).toHaveBeenCalledWith("PL1");
    expect(playlistOf("local-1")?.tracks.map((track) => track.id)).toEqual(["dQw4w9WgXcQ", "aaaaaaaaaaa"]);
    await refreshStaleYtPlaylists();
    expect(bridge.myPlaylists).toHaveBeenCalledTimes(1);
  });

  it("refreshes at most three playlists at once and reports the skipped songs", async () => {
    for (const n of [1, 2, 3, 4]) {
      useLibrary.getState().importLinkedPlaylist(`local-${n}`, `P${n}`, `PL${n}`, [song("dQw4w9WgXcQ")]);
    }
    bridge.myPlaylists.mockResolvedValue(
      [1, 2, 3, 4].map((n) => ({ id: `PL${n}`, title: `P${n}`, count: n === 4 ? 3 : 1, thumbnail: null })),
    );
    let running = 0;
    let peak = 0;
    bridge.playlistVideos.mockImplementation(async (id: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return id === "PL4" ? [video("v1"), video("v2")] : [video("v1")];
    });

    await refreshStaleYtPlaylists(LATER);

    expect(peak).toBe(3);
    expect(messages()).toContain("Skipped 1 unavailable song");
  });
});
