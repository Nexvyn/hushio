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

import { nextBlendTarget, usePlayer } from "./player";
import { useSleepTimer } from "./sleepTimer";
import type { Track } from "../types";

const MINUTE = 60_000;
const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: "Artist", thumb: null });
const sleep = () => useSleepTimer.getState();
const player = () => usePlayer.getState();
const lastVolume = () => setVolume.mock.calls.at(-1)?.[0];
const initialPlayer = usePlayer.getState();
const initialSleep = useSleepTimer.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useSleepTimer.setState(initialSleep, true);
  usePlayer.setState({ volume: 0.5, queue: [track(0)], index: 0, playing: true, duration: 300, position: 0 });
});

afterEach(() => {
  sleep().cancel();
  vi.useRealTimers();
});

describe("preset countdown", () => {
  it("stores the end time the chosen minutes away", () => {
    const now = Date.now();
    sleep().start(5);

    expect(sleep().endsAt).toBe(now + 5 * MINUTE);
    expect(sleep().endOfSong).toBe(false);
  });

  it("clamps the minutes to the range 1 to 720", () => {
    sleep().start(0);
    expect(sleep().endsAt).toBe(Date.now() + MINUTE);

    sleep().start(5000);
    expect(sleep().endsAt).toBe(Date.now() + 720 * MINUTE);
  });

  it("rounds fractional minutes", () => {
    sleep().start(2.6);

    expect(sleep().endsAt).toBe(Date.now() + 3 * MINUTE);
  });

  it("keeps full volume until the last ten seconds", () => {
    sleep().start(1);
    vi.advanceTimersByTime(49_000);

    expect(sleep().level).toBe(1);
    expect(lastVolume()).toBe(0.5);
  });

  it("leaves the audio volume alone while the level is unchanged", () => {
    sleep().start(5);
    setVolume.mockClear();

    vi.advanceTimersByTime(4 * MINUTE);

    expect(setVolume).not.toHaveBeenCalled();
  });

  it("fades the volume over the last ten seconds", () => {
    sleep().start(1);
    vi.advanceTimersByTime(55_000);

    expect(sleep().level).toBe(0.5);
    expect(lastVolume()).toBe(0.25);
  });

  it("pauses at zero, sets the level to 0, and restores the level 500 ms later", () => {
    sleep().start(1);
    vi.advanceTimersByTime(59_000);
    expect(player().playing).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(player().playing).toBe(false);
    expect(sleep().endsAt).toBeNull();
    expect(sleep().level).toBe(0);
    expect(lastVolume()).toBe(0);

    vi.advanceTimersByTime(500);
    expect(sleep().level).toBe(1);
    expect(lastVolume()).toBe(0.5);
  });

  it("stops the ticker after it fires", () => {
    sleep().start(1);
    vi.advanceTimersByTime(61_000);
    setVolume.mockClear();

    vi.advanceTimersByTime(MINUTE);
    expect(setVolume).not.toHaveBeenCalled();
  });
});

describe("end of this song", () => {
  it("switches to end-of-song mode without an end time", () => {
    sleep().startEndOfSong();

    expect(sleep().endOfSong).toBe(true);
    expect(sleep().endsAt).toBeNull();
  });

  it("fades with the length left in the song", () => {
    usePlayer.setState({ duration: 100, position: 95 });
    sleep().startEndOfSong();
    vi.advanceTimersByTime(250);

    expect(sleep().level).toBe(0.5);
    expect(lastVolume()).toBe(0.25);
  });

  it("does not arm a crossfade into the next song", () => {
    usePlayer.setState({ queue: [track(0), track(1)], index: 0, repeat: "all" });
    expect(nextBlendTarget()?.id).toBe("t1");

    sleep().startEndOfSong();
    expect(nextBlendTarget()).toBeNull();
  });

  it("stops at the end of the song instead of advancing, even with repeat one", () => {
    usePlayer.setState({ queue: [track(0), track(1)], index: 0, repeat: "one" });
    sleep().startEndOfSong();

    player().handleEnded();

    expect(player().index).toBe(0);
    expect(player().playing).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(sleep().endOfSong).toBe(false);
  });

  it("keeps the song playing when it does not reach the end", () => {
    usePlayer.setState({ duration: 300, position: 10 });
    sleep().startEndOfSong();
    vi.advanceTimersByTime(10 * MINUTE);

    expect(player().playing).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });
});

describe("cancel", () => {
  it("clears the countdown, restores the volume and never pauses", () => {
    sleep().start(1);
    vi.advanceTimersByTime(55_000);

    sleep().cancel();

    expect(sleep().endsAt).toBeNull();
    expect(sleep().level).toBe(1);
    expect(lastVolume()).toBe(0.5);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(pause).not.toHaveBeenCalled();
  });

  it("replaces a running timer when a new preset is chosen", () => {
    sleep().start(1);
    sleep().start(30);

    expect(sleep().endsAt).toBe(Date.now() + 30 * MINUTE);
    vi.advanceTimersByTime(MINUTE);
    expect(pause).not.toHaveBeenCalled();
  });

  it("switches off end-of-song mode when a timed preset starts", () => {
    sleep().startEndOfSong();
    sleep().start(5);

    expect(sleep().endOfSong).toBe(false);
    expect(sleep().endsAt).not.toBeNull();
  });
});

describe("pause and resume", () => {
  it("keeps counting while playback is paused", () => {
    sleep().start(1);
    usePlayer.setState({ playing: false });

    vi.advanceTimersByTime(60_000);

    expect(sleep().endsAt).toBeNull();
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("keeps the same end time when playback resumes before it ends", () => {
    sleep().start(1);
    const endsAt = sleep().endsAt;
    usePlayer.setState({ playing: false });
    vi.advanceTimersByTime(20_000);
    usePlayer.setState({ playing: true });
    vi.advanceTimersByTime(20_000);

    expect(sleep().endsAt).toBe(endsAt);
    expect(player().playing).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });

  it("keeps the fade level when playback resumes during the fade", () => {
    sleep().start(1);
    vi.advanceTimersByTime(55_000);
    usePlayer.setState({ playing: false });
    usePlayer.setState({ playing: true });
    vi.advanceTimersByTime(2_500);

    expect(sleep().level).toBe(0.25);
    expect(lastVolume()).toBe(0.125);
  });

  it("waits for the song to end when paused in end-of-song mode", () => {
    sleep().startEndOfSong();
    usePlayer.setState({ playing: false });
    vi.advanceTimersByTime(10 * MINUTE);

    expect(sleep().endOfSong).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });
});
