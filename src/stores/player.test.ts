import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { useLibrary } from "./library";
import { currentTrack, playFromRow, usePlayer } from "./player";
import { useUI } from "./ui";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: "Artist", thumb: null });
const list = (count: number) => Array.from({ length: count }, (_, i) => track(i));
const state = () => usePlayer.getState();
const currentId = () => currentTrack(state())?.id;
const queueIds = () => state().queue.map((item) => item.id);
const initial = usePlayer.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initial, true);
  useUI.setState({ toasts: [], pendingToasts: [] });
});

describe("playQueue and starting playback", () => {
  it("starts the chosen song and loads it into the engine", () => {
    state().playQueue(list(3), 1, "album-1");

    expect(state().index).toBe(1);
    expect(state().playing).toBe(true);
    expect(state().playingFrom).toBe("album-1");
    expect(playStream).toHaveBeenLastCalledWith("t1", "Track 1");
    expect(state().played.map((item) => item.id)).toEqual(["t1"]);
    expect(useLibrary.getState().history[0]?.id).toBe("t1");
  });

  it("drops a song marked Don't play this from the queue and remembers it", () => {
    state().playQueue(list(3), 0);
    state().dontPlay(1);

    expect(queueIds()).toEqual(["t0", "t2"]);
    expect(state().blocked.map((item) => item.id)).toEqual(["t1"]);
  });

  it("ignores an empty list", () => {
    state().playQueue([]);
    expect(state().queue).toEqual([]);
    expect(playStream).not.toHaveBeenCalled();
  });

  it("clamps the start index into the list", () => {
    state().playQueue(list(3), 99);
    expect(state().index).toBe(2);
    state().playQueue(list(3), -4);
    expect(state().index).toBe(0);
  });

  it("starts the queue from the clicked row through playFromRow", () => {
    const tracks = list(5);
    playFromRow(tracks, 3, "library");

    expect(currentId()).toBe("t3");
    expect(queueIds()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(state().playingFrom).toBe("library");
  });

  it("starts with the clicked song first when shuffle is on", () => {
    usePlayer.setState({ shuffle: true });
    state().playQueue(list(6), 4);

    expect(state().index).toBe(0);
    expect(currentId()).toBe("t4");
    expect(queueIds().slice().sort()).toEqual(["t0", "t1", "t2", "t3", "t4", "t5"]);
    expect(state().unshuffled).toEqual(["t4", "t5", "t0", "t1", "t2", "t3"]);
  });

  it("shows a toast and stops when the song cannot load", async () => {
    playStream.mockRejectedValueOnce(new Error("offline"));
    state().playQueue(list(1));
    await vi.waitFor(() => expect(state().playing).toBe(false));

    expect(useUI.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: "Couldn't play \"Track 0\"",
    });
  });
});

describe("50 song queue", () => {
  it("moves forward and back through every song", () => {
    state().playQueue(list(50), 0);

    for (let step = 1; step <= 49; step++) {
      state().next(true);
      expect(state().index).toBe(step);
    }
    expect(currentId()).toBe("t49");

    for (let step = 48; step >= 0; step--) {
      usePlayer.setState({ position: 0 });
      state().prev();
      expect(state().index).toBe(step);
    }
    expect(currentId()).toBe("t0");
  });

  it("wraps from the last song to the first on a manual next", () => {
    state().playQueue(list(50), 49);
    state().next(true);
    expect(state().index).toBe(0);
    expect(playStream).toHaveBeenLastCalledWith("t0", "Track 0");
  });

  it("previous from the first song goes to the last song", () => {
    state().playQueue(list(50), 0);
    state().prev();
    expect(currentId()).toBe("t49");
  });
});

describe("next and previous edge cases", () => {
  it("stops at the end on an automatic next when repeat is off", () => {
    state().playQueue(list(3), 2);
    state().handleEnded();

    expect(state().index).toBe(2);
    expect(state().playing).toBe(false);
    expect(state().position).toBe(0);
  });

  it("does nothing on next with an empty queue", () => {
    state().next(true);
    expect(state().playing).toBe(false);
    expect(playStream).not.toHaveBeenCalled();
  });

  it("restarts the song instead of going back when more than 3 seconds have played", () => {
    state().playQueue(list(3), 1);
    usePlayer.setState({ position: 10 });
    state().prev();

    expect(seekTo).toHaveBeenLastCalledWith(0);
    expect(state().index).toBe(1);
    expect(state().position).toBe(0);
  });

  it("a swipe back always goes to the previous song, even after more than 3 seconds", () => {
    state().playQueue(list(3), 2);
    usePlayer.setState({ position: 42 });
    state().prevTrack();

    expect(state().index).toBe(1);
    expect(state().position).toBe(0);
    expect(seekTo).not.toHaveBeenCalledWith(0);
    expect(playStream).toHaveBeenLastCalledWith("t1", "Track 1");
  });

  it("goes back at 3 seconds or less", () => {
    state().playQueue(list(3), 1);
    usePlayer.setState({ position: 3 });
    state().prev();
    expect(state().index).toBe(0);
  });

  it("ignores jumps outside the queue", () => {
    state().playQueue(list(3), 0);
    state().jumpTo(5);
    state().jumpTo(-1);
    expect(state().index).toBe(0);
  });

  it("jumps to a row in the queue", () => {
    state().playQueue(list(4), 0);
    state().jumpTo(2);
    expect(currentId()).toBe("t2");
  });
});

describe("repeat", () => {
  it("cycles off, all, one and back to off", () => {
    const modes = [];
    for (let i = 0; i < 4; i++) {
      state().cycleRepeat();
      modes.push(state().repeat);
    }
    expect(modes).toEqual(["all", "one", "off", "all"]);
  });

  it("repeat one replays the same song at the end", () => {
    usePlayer.setState({ repeat: "one" });
    state().playQueue(list(3), 2);
    playStream.mockClear();
    state().handleEnded();

    expect(state().index).toBe(2);
    expect(seekTo).toHaveBeenLastCalledWith(0);
    expect(play).toHaveBeenCalled();
    expect(state().playing).toBe(true);
    expect(playStream).not.toHaveBeenCalled();
  });

  it("repeat one keeps the song on an automatic end in the middle of the queue", () => {
    usePlayer.setState({ repeat: "one" });
    state().playQueue(list(3), 0);
    state().handleEnded();
    expect(state().index).toBe(0);
  });

  it("repeat all wraps to the first song at the end", () => {
    usePlayer.setState({ repeat: "all" });
    state().playQueue(list(3), 2);
    state().handleEnded();

    expect(state().index).toBe(0);
    expect(state().playing).toBe(true);
    expect(playStream).toHaveBeenLastCalledWith("t0", "Track 0");
  });

  it("repeat all with shuffle reshuffles the queue and keeps every song", () => {
    usePlayer.setState({ repeat: "all", shuffle: true });
    state().playQueue(list(5), 0);
    state().jumpTo(4);
    const before = currentId();
    state().handleEnded();

    expect(state().index).toBe(0);
    expect(queueIds().slice().sort()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(currentId()).not.toBe(before);
  });
});

describe("playing a track", () => {
  it("moves to a track that is already upcoming without duplicating it", () => {
    state().playQueue(list(4), 0);
    state().playTrack(track(2));

    expect(queueIds()).toEqual(["t0", "t1", "t2", "t3"]);
    expect(state().index).toBe(2);
  });

  it("inserts a track that is not upcoming after the current song", () => {
    state().playQueue(list(3), 0);
    state().playTrack(track(9));

    expect(queueIds()).toEqual(["t0", "t9", "t1", "t2"]);
    expect(state().index).toBe(1);
    expect(currentId()).toBe("t9");
  });

  it("starts a queue from an empty state", () => {
    state().playTrack(track(7));
    expect(queueIds()).toEqual(["t7"]);
    expect(state().index).toBe(0);
  });
});

describe("adding and removing", () => {
  it("adds to the end without duplicating upcoming songs", () => {
    state().playQueue(list(3), 0);
    const added = state().addToQueue([track(1), track(5), track(5)]);

    expect(added).toBe(1);
    expect(queueIds()).toEqual(["t0", "t1", "t2", "t5"]);
  });

  it("puts a play-next song right after the current song", () => {
    state().playQueue(list(3), 0);
    state().addToQueue([track(8)], true);

    expect(queueIds()).toEqual(["t0", "t8", "t1", "t2"]);
  });

  it("returns 0 when every song is already queued", () => {
    state().playQueue(list(2), 0);
    expect(state().addToQueue([track(1)])).toBe(0);
  });

  it("starts an empty queue paused without playing anything", () => {
    const added = state().addToQueue(list(2));

    expect(added).toBe(2);
    expect(state().index).toBe(0);
    expect(state().playing).toBe(false);
    expect(playStream).not.toHaveBeenCalled();
  });

  it("removes an upcoming song and keeps the current index", () => {
    state().playQueue(list(4), 1);
    state().removeAt(3);

    expect(queueIds()).toEqual(["t0", "t1", "t2"]);
    expect(state().index).toBe(1);
  });

  it("shifts the index back when a song before it is removed", () => {
    state().playQueue(list(4), 2);
    state().removeAt(0);

    expect(queueIds()).toEqual(["t1", "t2", "t3"]);
    expect(currentId()).toBe("t2");
  });

  it("plays the next song when the playing song is removed", () => {
    state().playQueue(list(3), 1);
    playStream.mockClear();
    state().removeAt(1);

    expect(currentId()).toBe("t2");
    expect(playStream).toHaveBeenLastCalledWith("t2", "Track 2");
  });

  it("stops and clears when the last remaining song is removed", () => {
    state().playQueue(list(1), 0);
    state().removeAt(0);

    expect(state().queue).toEqual([]);
    expect(state().playing).toBe(false);
    expect(pause).toHaveBeenCalled();
  });

  it("clears upcoming songs and keeps the current song", () => {
    state().playQueue(list(5), 2);
    state().clearUpcoming();

    expect(queueIds()).toEqual(["t0", "t1", "t2"]);
    expect(currentId()).toBe("t2");
  });
});

describe("shuffle", () => {
  it("keeps the playing song first and every song in the queue", () => {
    state().playQueue(list(8), 3);
    state().toggleShuffle();

    expect(state().shuffle).toBe(true);
    expect(currentId()).toBe("t3");
    expect(queueIds().slice().sort()).toEqual(list(8).map((item) => item.id).sort());
  });

  it("restores the original order when turned off", () => {
    state().playQueue(list(8), 2);
    state().toggleShuffle();
    state().toggleShuffle();

    expect(state().shuffle).toBe(false);
    expect(state().unshuffled).toBeNull();
    expect(queueIds()).toEqual(list(8).map((item) => item.id));
  });

  it("keeps a song added while shuffled in the user's order", () => {
    usePlayer.setState({ shuffle: true });
    state().playQueue(list(3), 0);
    state().addToQueue([track(9)]);
    state().toggleShuffle();

    expect(queueIds()).toEqual(["t0", "t1", "t2", "t9"]);
  });
});

describe("transport", () => {
  it("pauses a playing song and resumes the same song", () => {
    state().playQueue(list(2), 0);
    state().toggle();
    expect(pause).toHaveBeenCalled();
    expect(state().playing).toBe(false);

    state().toggle();
    expect(play).toHaveBeenCalled();
    expect(state().playing).toBe(true);
  });

  it("loads the current song when nothing is loaded yet", () => {
    state().addToQueue([{ id: "fresh", title: "Fresh", artist: "Artist", thumb: null }]);
    playStream.mockClear();
    state().toggle();

    expect(playStream).toHaveBeenCalledWith("fresh", "Fresh");
  });

  it("clamps the volume and unmutes", () => {
    usePlayer.setState({ muted: true });
    state().setVolume(1.4);
    expect(state().volume).toBe(1);
    expect(state().muted).toBe(false);
    expect(setVolume).toHaveBeenLastCalledWith(1);

    state().setVolume(-1);
    expect(state().volume).toBe(0);
  });

  it("ignores a volume that is not a number", () => {
    state().setVolume(Number.NaN);
    expect(state().volume).toBe(0.8);
  });

  it("toggles mute on the engine", () => {
    state().toggleMute();
    expect(setMuted).toHaveBeenLastCalledWith(true);
    expect(state().muted).toBe(true);
  });

  it("seeks and never goes below zero", () => {
    state().seek(-5);
    expect(seekTo).toHaveBeenLastCalledWith(0);
    expect(state().position).toBe(0);

    state().seek(42);
    expect(seekTo).toHaveBeenLastCalledWith(42);
    expect(state().position).toBe(42);
  });

  it("follows the engine events", () => {
    state().playQueue(list(2), 0);
    audio.dispatchEvent(new Event("pause"));
    expect(state().playing).toBe(false);

    audio.dispatchEvent(new Event("playing"));
    expect(state().playing).toBe(true);

    audio.dispatchEvent(new Event("ended"));
    expect(state().index).toBe(1);
  });
});

describe("queue edits and shuffle passes", () => {
  it("plays every song once in a shuffled pass before the pass starts again", () => {
    usePlayer.setState({ shuffle: true });
    state().playQueue(list(6), 0);
    const pass = [currentId()];
    for (let step = 1; step < 6; step++) {
      state().next(true);
      pass.push(currentId());
    }
    expect(pass.slice().sort()).toEqual(list(6).map((item) => item.id));

    const last = currentId();
    state().next(true);
    expect(state().index).toBe(0);
    expect(currentId()).not.toBe(last);
    expect(queueIds().slice().sort()).toEqual(list(6).map((item) => item.id));
  });

  it("keeps a play-next song after the current song when shuffle is turned off", () => {
    usePlayer.setState({ shuffle: true });
    state().playQueue(list(4), 0);
    state().addToQueue([track(9)], true);
    state().toggleShuffle();

    expect(queueIds()).toEqual(["t0", "t9", "t1", "t2", "t3"]);
  });

  it("moves to the first song on a manual next even when repeat is one", () => {
    usePlayer.setState({ repeat: "one" });
    state().playQueue(list(3), 2);
    state().next(true);

    expect(currentId()).toBe("t0");
  });

  it("plays the new last song when the playing last song is removed", () => {
    state().playQueue(list(3), 2);
    playStream.mockClear();
    state().removeAt(2);

    expect(state().index).toBe(1);
    expect(playStream).toHaveBeenLastCalledWith("t1", "Track 1");
  });

  it("moves to the next song without playing when the current song is removed while paused", () => {
    state().playQueue(list(3), 1);
    state().toggle();
    playStream.mockClear();
    state().removeAt(1);

    expect(currentId()).toBe("t2");
    expect(state().playing).toBe(false);
    expect(playStream).not.toHaveBeenCalled();
  });

  it("drops a removed song from the user's order so turning shuffle off restores the rest", () => {
    state().playQueue(list(4), 0);
    state().toggleShuffle();
    const removed = queueIds()[2];
    state().removeAt(2);
    state().toggleShuffle();

    expect(queueIds()).toEqual(list(4).map((item) => item.id).filter((id) => id !== removed));
  });
});
