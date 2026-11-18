import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { addTracksToQueueAt, dropTracksOnTarget } from "./trackDrop";
import { type LibraryTrack, useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const track = (i: number): LibraryTrack => ({
  id: `s${i}`,
  title: `Song ${i}`,
  artist: "Artist",
  thumb: null,
  album: null,
  duration: 200,
  explicit: false,
});
const plain = (i: number): Track => ({ id: `q${i}`, title: `Queued ${i}`, artist: "Artist", thumb: null });

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();
const messages = () => useUI.getState().toasts.map((item) => item.message);

beforeEach(() => {
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useUI.setState({ ...initialUI, dialog: null, toasts: [] }, true);
  useLibrary.setState({ playlists: [{ id: "p1", name: "Road trip", folderId: null, pinned: false, tracks: [] }] });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("dropTracksOnTarget", () => {
  it("likes a dropped song once and says so", () => {
    dropTracksOnTarget("liked", [track(1)]);
    dropTracksOnTarget("liked", [track(1)]);
    expect(useLibrary.getState().liked.map((item) => item.id)).toEqual(["s1"]);
    expect(messages()).toEqual(["Added “Song 1” to Liked Songs", "Already in your Liked Songs"]);
  });

  it("adds every dropped song to a playlist with one message", () => {
    dropTracksOnTarget("playlist:p1", [track(1), track(2)]);
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(messages()).toEqual(["Added 2 songs to “Road trip”"]);
  });

  it("names a single song that is already in the playlist", () => {
    dropTracksOnTarget("playlist:p1", [track(1)]);
    dropTracksOnTarget("playlist:p1", [track(1)]);
    expect(messages()).toEqual(["Added “Song 1” to “Road trip”", "“Song 1” is already in “Road trip”"]);
  });
});

describe("addTracksToQueueAt", () => {
  function queueRows(tops: [number, number][]) {
    const panel = document.createElement("section");
    panel.dataset.dropTarget = "queue";
    tops.forEach(([at, top]) => {
      const row = document.createElement("li");
      row.dataset.queueAt = String(at);
      row.getBoundingClientRect = () => ({ top, height: 56, bottom: top + 56, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      panel.append(row);
    });
    document.body.append(panel);
  }

  beforeEach(() => {
    usePlayer.setState({ queue: [plain(0), plain(1), plain(2), plain(3)], index: 0, shuffle: false, unshuffled: null });
    queueRows([
      [1, 100],
      [2, 156],
      [3, 212],
    ]);
  });

  it("joins Next in queue at its top when the pointer is over the playing context", () => {
    addTracksToQueueAt([track(9)], 150);
    const queue = usePlayer.getState().queue;
    expect(queue.map((item) => item.id)).toEqual(["q0", "s9", "q1", "q2", "q3"]);
    expect(queue[1].queued).toBe(true);
  });

  it("inserts the songs above the row under the pointer inside Next in queue", () => {
    usePlayer.setState({ queue: [plain(0), { ...plain(1), queued: true }, { ...plain(2), queued: true }, plain(3)] });
    addTracksToQueueAt([track(9)], 150);
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["q0", "q1", "s9", "q2", "q3"]);
  });

  it("puts the songs first after the playing song when the pointer is above the list", () => {
    addTracksToQueueAt([track(8), track(9)], 10);
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["q0", "s8", "s9", "q1", "q2", "q3"]);
  });

  it("ends Next in queue when the pointer is below the list", () => {
    usePlayer.setState({ queue: [plain(0), { ...plain(1), queued: true }, plain(2), plain(3)] });
    addTracksToQueueAt([track(9)], 999);
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["q0", "q1", "s9", "q2", "q3"]);
  });
});
