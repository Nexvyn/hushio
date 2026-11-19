import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playbackEvent } = vi.hoisted(() => ({ playbackEvent: vi.fn() }));

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  playbackEvent,
}));

import {
  pauseListen,
  resumeListen,
  setListenDuration,
  startListen,
  stopListen,
  tick,
} from "./listening";
import type { Track } from "../types";

const song = (id: string, extra: Partial<Track> = {}): Track => ({ id, title: `Title ${id}`, artist: "Artist", thumb: null, ...extra });
const T0 = 1_000_000;
const sent = () => playbackEvent.mock.calls.map((call) => call[0]);

beforeEach(() => {
  playbackEvent.mockReset().mockResolvedValue(undefined);
  stopListen(T0);
  playbackEvent.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listening events", () => {
  it("sends start with the track and no delta", () => {
    startListen(song("a"), T0);
    expect(sent()).toEqual([{ type: "start", track: { id: "a", title: "Title a", artist: "Artist", thumb: null } }]);
  });

  it("sends progress deltas only while playing", () => {
    startListen(song("a"), T0);
    resumeListen(T0);
    tick(T0 + 10_000);
    pauseListen(T0 + 15_000);
    tick(T0 + 40_000);
    expect(sent().map((event) => [event.type, event.deltaMs])).toEqual([
      ["start", undefined],
      ["resume", undefined],
      ["progress", 10_000],
      ["pause", 5_000],
    ]);
  });

  it("sends no progress for ticks less than 5 seconds apart", () => {
    startListen(song("a"), T0);
    resumeListen(T0);
    tick(T0 + 2_000);
    tick(T0 + 4_000);
    expect(sent().map((event) => event.type)).toEqual(["start", "resume"]);
  });

  it("sends the whole delta on pause after several short ticks", () => {
    startListen(song("a"), T0);
    resumeListen(T0);
    tick(T0 + 1_000);
    tick(T0 + 2_000);
    tick(T0 + 3_000);
    pauseListen(T0 + 4_000);
    expect(sent().map((event) => [event.type, event.deltaMs])).toEqual([
      ["start", undefined],
      ["resume", undefined],
      ["pause", 4_000],
    ]);
  });

  it("does not count the time between start and the first resume", () => {
    startListen(song("a"), T0);
    tick(T0 + 8_000);
    expect(sent()).toHaveLength(1);
  });

  it("sends the audio duration once it is known", () => {
    startListen(song("a"), T0);
    setListenDuration(200);
    resumeListen(T0);
    tick(T0 + 5_000);
    expect(sent().at(-1)).toMatchObject({ type: "progress", deltaMs: 5_000, track: { duration: 200 } });
  });

  it("closes the previous track with a pause before starting the next one", () => {
    startListen(song("a"), T0);
    resumeListen(T0);
    startListen(song("b"), T0 + 31_000);
    expect(sent().map((event) => [event.type, event.track?.id, event.deltaMs])).toEqual([
      ["start", "a", undefined],
      ["resume", "a", undefined],
      ["pause", "a", 31_000],
      ["start", "b", undefined],
    ]);
  });

  it("sends stop with the last delta and ends the session", () => {
    startListen(song("a"), T0);
    resumeListen(T0);
    stopListen(T0 + 2_000);
    tick(T0 + 9_000);
    expect(sent().at(-1)).toMatchObject({ type: "stop", deltaMs: 2_000 });
    expect(sent()).toHaveLength(3);
  });

  it("sends stop even when the track is paused", () => {
    startListen(song("a"), T0);
    stopListen(T0);
    expect(sent().at(-1)).toMatchObject({ type: "stop", deltaMs: 0 });
  });

  it("never sends listening deltas for podcast episodes", () => {
    startListen(song("e", { episode: true }), T0);
    resumeListen(T0);
    tick(T0 + 60_000);
    pauseListen(T0 + 61_000);
    expect(sent().map((event) => event.type)).toEqual(["start", "resume"]);
    expect(sent()[0].track).toMatchObject({ episode: true });
  });

  it("ignores resume, tick and pause when nothing is playing", () => {
    tick(T0);
    pauseListen(T0);
    resumeListen(T0);
    expect(sent()).toEqual([]);
  });

  it("logs a failed event and keeps listening", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    playbackEvent.mockRejectedValueOnce(new Error("bridge down"));
    startListen(song("a"), T0);
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith("[hushio] listening event failed: bridge down");
  });
});
