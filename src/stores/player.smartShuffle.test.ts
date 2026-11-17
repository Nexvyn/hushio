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
import { usePlayer } from "./player";
import { useSettings } from "./settings";
import type { Track } from "../types";

const vid = (n: number) => `v${String(n).padStart(10, "0")}`;
const song = (n: number): Track => ({ id: vid(n), title: `Song ${n}`, artist: `Artist ${n}`, thumb: null });

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

const radioPage = (numbers: number[]): RadioPage => ({ items: numbers.map(radioItem), seed: null, continuation: null });

const state = () => usePlayer.getState();
const initial = usePlayer.getState();

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  getRadio.mockReset();
  getRadio.mockResolvedValue(radioPage([]));
  playStream.mockReset();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initial, true);
  useSettings.setState({ autoplay: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shuffle modes", () => {
  it("cycles off, shuffle, smart shuffle and back to off", () => {
    state().cycleShuffle();
    expect(state().shuffle).toBe(true);
    expect(state().smartShuffle).toBe(false);

    state().cycleShuffle();
    expect(state().shuffle).toBe(true);
    expect(state().smartShuffle).toBe(true);

    state().cycleShuffle();
    expect(state().shuffle).toBe(false);
    expect(state().smartShuffle).toBe(false);
  });

  it("the plain toggle clears smart shuffle", () => {
    state().cycleShuffle();
    state().cycleShuffle();
    state().toggleShuffle();
    expect(state().shuffle).toBe(false);
    expect(state().smartShuffle).toBe(false);
  });

  it("migrates older saved state to smart shuffle off", () => {
    const migrate = usePlayer.persist.getOptions().migrate;
    const migrated = migrate?.({ queue: [], shuffle: true } as never, 1) as { smartShuffle?: boolean };
    expect(migrated.smartShuffle).toBe(false);
  });
});

describe("smart shuffle picks", () => {
  it("adds one recommended song after three songs and marks it", async () => {
    getRadio.mockResolvedValue(radioPage([50]));
    state().cycleShuffle();
    state().cycleShuffle();
    state().playQueue([1, 2, 3, 4, 5, 6].map(song));

    await vi.waitFor(() => expect(state().queue.some((track) => track.recommended)).toBe(true));
    const at = state().queue.findIndex((track) => track.recommended);
    expect(at - state().index).toBe(4);
    expect(state().queue[at].id).toBe(vid(50));
    expect(getRadio).toHaveBeenCalledTimes(1);
  });

  it("does not add a second pick while one is still ahead", async () => {
    getRadio.mockResolvedValue(radioPage([50]));
    state().cycleShuffle();
    state().cycleShuffle();
    state().playQueue([1, 2, 3, 4, 5, 6].map(song));
    await vi.waitFor(() => expect(state().queue.some((track) => track.recommended)).toBe(true));

    state().next(true);
    expect(getRadio).toHaveBeenCalledTimes(1);
    expect(state().queue.filter((track) => track.recommended)).toHaveLength(1);
  });

  it("removes upcoming picks when shuffle is turned off", async () => {
    getRadio.mockResolvedValue(radioPage([50]));
    state().cycleShuffle();
    state().cycleShuffle();
    state().playQueue([1, 2, 3, 4, 5, 6].map(song));
    await vi.waitFor(() => expect(state().queue.some((track) => track.recommended)).toBe(true));

    state().cycleShuffle();
    expect(state().queue.some((track) => track.recommended)).toBe(false);
    expect(state().queue).toHaveLength(6);
  });
});
