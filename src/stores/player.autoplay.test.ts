import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted, getRadio } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getRadio: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play,
  pause,
  seekTo,
  setVolume,
  setMuted,
}));

vi.mock("../lib/innertube", () => ({ getRadio }));

vi.mock("../lib/theme", () => ({ applyTheme: () => {} }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import type { RadioItem, RadioPage } from "../lib/innertube";
import { useLibrary } from "./library";
import { usePlayer } from "./player";
import { useSettings } from "./settings";
import { useUI } from "./ui";
import type { Track } from "../types";

const vid = (n: number) => `v${String(n).padStart(10, "0")}`;
const song = (n: number): Track => ({ id: vid(n), title: `Song ${n}`, artist: `Artist ${n}`, thumb: null });
const seed: Track = { id: vid(900), title: "Seed", artist: "Seed Artist", thumb: null };

function radioItem(n: number): RadioItem {
  return {
    id: vid(n),
    title: `Song ${n}`,
    artist: `Artist ${n}`,
    artistId: `UC${n}`,
    thumb: null,
    duration: 200,
    explicit: false,
    videoType: "song",
  };
}

const radioPage = (numbers: number[], seedInfo: RadioPage["seed"] = null): RadioPage => ({
  items: numbers.map(radioItem),
  seed: seedInfo,
  continuation: null,
});

const state = () => usePlayer.getState();
const queueIds = () => state().queue.map((track) => track.id);
const initial = usePlayer.getState();
const initialLibrary = useLibrary.getState();
let clock = 1_000_000_000;

beforeEach(() => {
  clock += 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  getRadio.mockReset();
  getRadio.mockResolvedValue(radioPage([]));
  playStream.mockReset();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initial, true);
  useLibrary.setState(initialLibrary, true);
  useSettings.setState({ autoplay: true, dontRepeatSuggestions: false });
  useUI.setState({ toasts: [], pendingToasts: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AutoPlay past the first 25 suggestions", () => {
  it("refills when the suggestions still ahead run low, even after 25 were added", async () => {
    getRadio.mockResolvedValueOnce(radioPage(Array.from({ length: 25 }, (_, i) => i + 1)));
    state().playQueue([seed]);
    await vi.waitFor(() => expect(state().queue.length).toBe(26));

    getRadio.mockResolvedValueOnce(radioPage([26, 27]));
    state().jumpTo(21);
    await vi.waitFor(() => expect(queueIds()).toContain(vid(27)));
  });
});

describe("AutoPlay refill that finishes late", () => {
  it("plays the new songs when a refill that finished after the queue changed is dropped", async () => {
    let resolveOld: (page: RadioPage) => void = () => {};
    getRadio.mockReturnValueOnce(new Promise<RadioPage>((resolve) => (resolveOld = resolve)));
    getRadio.mockResolvedValueOnce(radioPage([2]));
    state().playQueue([seed]);
    state().playQueue([song(5)]);
    state().next();

    resolveOld(radioPage([1]));
    await vi.waitFor(() => expect(playStream).toHaveBeenLastCalledWith(vid(2), "Song 2", 0, expect.any(Object)));
  });
});

describe("AutoPlay at the end of the queue", () => {
  it("asks radio for songs after the last song and plays the first new one", async () => {
    getRadio.mockResolvedValueOnce(null);
    state().playQueue([seed]);
    await vi.waitFor(() => expect(state().error).not.toBeNull());

    getRadio.mockResolvedValueOnce(radioPage([1, 2]));
    state().next();

    await vi.waitFor(() => expect(playStream).toHaveBeenLastCalledWith(vid(1), "Song 1", 0, expect.any(Object)));
    expect(queueIds().slice(0, 3)).toEqual([seed.id, vid(1), vid(2)]);
    expect(state().index).toBe(1);
    expect(state().awaitingAutoplay).toBe(false);
    expect(getRadio).toHaveBeenNthCalledWith(2, seed.id, undefined);
  });

  it("does not add songs that are already in the queue", async () => {
    getRadio.mockResolvedValueOnce(radioPage([1, 2]));
    state().playQueue([seed, song(1)]);

    await vi.waitFor(() => expect(state().autoplayCount).toBe(1));
    expect(queueIds()).toEqual([seed.id, vid(1), vid(2)]);
  });

  it("sets the AutoPlay error and toasts when the refill fails while the queue is waiting", async () => {
    getRadio.mockResolvedValueOnce(null);
    state().playQueue([seed]);
    await vi.waitFor(() => expect(state().error).toBe("AutoPlay couldn't find more songs right now"));
    expect(useUI.getState().toasts).toEqual([]);

    getRadio.mockRejectedValueOnce(new Error("offline"));
    state().next();

    await vi.waitFor(() => expect(state().awaitingAutoplay).toBe(false));
    expect(state().playing).toBe(false);
    expect(state().error).toBe("AutoPlay couldn't find more songs right now");
    expect(useUI.getState().toasts).toEqual([
      expect.objectContaining({ message: "AutoPlay couldn't find more songs right now", kind: "info" }),
    ]);
  });

  it("does not retry a failed refill for 60 seconds unless the queue has run out", async () => {
    getRadio.mockResolvedValueOnce(null);
    state().playQueue([seed]);
    await vi.waitFor(() => expect(state().error).not.toBeNull());
    expect(getRadio).toHaveBeenCalledTimes(1);

    state().jumpTo(0);
    await Promise.resolve();
    expect(getRadio).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, "now").mockImplementation(() => clock + 60_000);
    getRadio.mockResolvedValueOnce(radioPage([3]));
    state().jumpTo(0);
    await vi.waitFor(() => expect(state().autoplayCount).toBe(1));
    expect(getRadio).toHaveBeenCalledTimes(2);
  });

  it("stops at the end when AutoPlay is off", async () => {
    useSettings.setState({ autoplay: false });
    state().playQueue([seed]);
    state().next();

    expect(state().playing).toBe(false);
    expect(getRadio).not.toHaveBeenCalled();
  });

  it("does not use AutoPlay when the last song is a local file", () => {
    useSettings.setState({ autoplay: true });
    state().playQueue([{ id: "local-file", title: "Local", artist: "Me", thumb: null }]);
    state().next();

    expect(getRadio).not.toHaveBeenCalled();
    expect(state().playing).toBe(false);
  });
});

describe("startRadio", () => {
  it("replaces the queue with the seed song followed by the radio songs", async () => {
    useSettings.setState({ autoplay: false });
    state().playQueue([song(50), song(51)], 1);
    useSettings.setState({ autoplay: true });
    getRadio.mockResolvedValueOnce(radioPage([1, 2, 3]));

    await state().startRadio(seed);

    expect(queueIds()).toEqual([seed.id, vid(1), vid(2), vid(3)]);
    expect(state().index).toBe(0);
    expect(state().playingFrom).toBeNull();
    expect(state().playing).toBe(true);
    expect(playStream).toHaveBeenLastCalledWith(seed.id, "Seed", 0, expect.any(Object));
  });

  it("leaves the queue alone and toasts an error when radio is empty", async () => {
    useSettings.setState({ autoplay: false });
    state().playQueue([song(50)]);
    useSettings.setState({ autoplay: true });
    getRadio.mockResolvedValueOnce(radioPage([]));

    await state().startRadio(seed);

    expect(queueIds()).toEqual([vid(50)]);
    expect(useUI.getState().toasts).toEqual([
      expect.objectContaining({ message: "Couldn't start radio right now", kind: "error" }),
    ]);
  });

  it("does not ask radio for a local file", async () => {
    await state().startRadio({ id: "local-file", title: "Local", artist: "Me", thumb: null });

    expect(getRadio).not.toHaveBeenCalled();
    expect(state().queue).toEqual([]);
    expect(useUI.getState().toasts).toHaveLength(1);
  });
});

describe("playArtistMix", () => {
  it("plays up to 30 unique songs from the artist", () => {
    const songs = Array.from({ length: 40 }, (_, i) => song(i % 35));

    state().playArtistMix("UCartist", songs);

    expect(state().queue).toHaveLength(30);
    expect(new Set(queueIds()).size).toBe(30);
    expect(queueIds().every((id) => songs.some((track) => track.id === id))).toBe(true);
    expect(getRadio).not.toHaveBeenCalled();
  });

  it("does nothing for an artist with no songs", () => {
    state().playArtistMix("UCempty", []);
    expect(state().queue).toEqual([]);
  });
});

describe("AutoPlay refill timing", () => {
  it("asks radio only once one of its own songs is left to play", async () => {
    state().playQueue([song(1), song(2), song(3), seed]);
    expect(getRadio).not.toHaveBeenCalled();

    state().jumpTo(2);
    expect(getRadio).toHaveBeenCalledWith(seed.id, undefined);
    await vi.waitFor(() => expect(state().error).not.toBeNull());
  });

  it("leaves out songs played earlier in the session", async () => {
    usePlayer.setState({ played: [song(5)] });
    getRadio.mockResolvedValueOnce(radioPage([5, 6]));
    state().playQueue([seed]);

    await vi.waitFor(() => expect(state().autoplayCount).toBe(1));
    expect(queueIds()).toEqual([seed.id, vid(6)]);
  });

  it("leaves out songs marked Don't play this", async () => {
    usePlayer.setState({ blocked: [song(5)] });
    getRadio.mockResolvedValueOnce(radioPage([5, 6]));
    state().playQueue([seed]);

    await vi.waitFor(() => expect(state().autoplayCount).toBe(1));
    expect(queueIds()).toEqual([seed.id, vid(6)]);
  });

  it("leaves out songs in Recently played when Don't repeat suggestions is on", async () => {
    useSettings.setState({ dontRepeatSuggestions: true });
    useLibrary.setState({ history: [{ ...song(5), album: null, duration: 0, explicit: false }] });
    getRadio.mockResolvedValueOnce(radioPage([5, 6]));
    state().playQueue([seed]);

    await vi.waitFor(() => expect(state().autoplayCount).toBe(1));
    expect(queueIds()).toEqual([seed.id, vid(6)]);
  });

  it("does not continue after a podcast episode", async () => {
    getRadio.mockResolvedValue(radioPage([1, 2]));
    state().playQueue([{ ...seed, episode: true }]);
    state().handleEnded();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getRadio).not.toHaveBeenCalled();
    expect(queueIds()).toEqual([seed.id]);
    expect(state().error).toBeNull();
  });

  it("asks radio with the clicked song as the seed", async () => {
    getRadio.mockResolvedValueOnce(radioPage([1, 2]));
    await state().startRadio(seed);

    expect(getRadio).toHaveBeenNthCalledWith(1, seed.id, undefined);
    expect(queueIds()).toEqual([seed.id, vid(1), vid(2)]);
  });
});
