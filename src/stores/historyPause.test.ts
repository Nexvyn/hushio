import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  persistRead: vi.fn(),
  persistWrite: vi.fn(),
  playbackEvent: vi.fn(),
  googleAccountGet: vi.fn(),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  persistRead: bridge.persistRead,
  persistWrite: bridge.persistWrite,
  playbackEvent: bridge.playbackEvent,
  googleAccountGet: bridge.googleAccountGet,
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { useRecents } from "./recents";
import { useLibrary } from "./library";
import { useSettings } from "./settings";
import { startListen, tick } from "../lib/listening";

const track = { id: "t1", title: "Title", artist: "Artist", thumb: null };

describe("pausing the history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.playbackEvent.mockResolvedValue(undefined);
    bridge.persistWrite.mockResolvedValue(true);
    useSettings.setState({ pauseListeningHistory: false, pauseSearchHistory: false });
    useLibrary.setState({ history: [] });
    useRecents.setState({ searches: [] });
  });

  it("keeps the search history when the setting is off", () => {
    useRecents.getState().pushSearch("hello");
    expect(useRecents.getState().searches).toEqual(["hello"]);
  });

  it("keeps nothing when the search history is paused", () => {
    useSettings.setState({ pauseSearchHistory: true });
    useRecents.getState().pushSearch("hello");
    expect(useRecents.getState().searches).toEqual([]);
  });

  it("keeps the played songs out of the library history when it is paused", () => {
    useSettings.setState({ pauseListeningHistory: true });
    useLibrary.getState().pushHistory(track);
    expect(useLibrary.getState().history).toEqual([]);
  });

  it("tells the backend not to record when the history is paused", () => {
    useSettings.setState({ pauseListeningHistory: true });
    startListen(track, 1_000);
    tick(2_000);
    const events = bridge.playbackEvent.mock.calls.map((call) => call[0] as { history?: boolean });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.history === false)).toBe(true);
  });

  it("leaves the history flag out when the history is on", () => {
    startListen(track, 1_000);
    const events = bridge.playbackEvent.mock.calls.map((call) => call[0] as { history?: boolean });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.history === undefined)).toBe(true);
  });
});
