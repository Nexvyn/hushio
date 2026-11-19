import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("./bridge", () => ({ replaySummary: vi.fn(), replayJournal: vi.fn() }));
vi.mock("./persist", () => ({ persistStorage: () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }) }));
vi.mock("./audio", () => ({ audio: new Audio(), play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), playStream: vi.fn() }));

import { replayJournal, replaySummary } from "./bridge";
import { forgetReplayCache, loadReplay, useListeningNow } from "./replayData";
import type { ReplayData } from "./replay";
import { usePlayer } from "../stores/player";
import type { Track } from "../types";

const summary: ReplayData = {
  period: "month",
  months: ["2026-11"],
  totalMs: 60_000,
  plays: 1,
  tracks: [],
  artists: [],
  albums: [],
  hours: new Array(24).fill(0),
  days: [],
  counts: { tracks: 0, artists: 0, albums: 0 },
};

const song: Track = { id: "s1", title: "Song", artist: "Artist", thumb: null };

beforeEach(() => {
  forgetReplayCache();
  vi.mocked(replaySummary).mockReset();
  vi.mocked(replayJournal).mockReset();
  usePlayer.setState({ playing: false, queue: [], index: 0 });
});

describe("loadReplay", () => {
  it("reads a summary period once and then serves it from the cache", async () => {
    vi.mocked(replaySummary).mockResolvedValue(summary);
    await expect(loadReplay("month")).resolves.toEqual(summary);
    await loadReplay("month");
    expect(replaySummary).toHaveBeenCalledTimes(1);
    expect(replaySummary).toHaveBeenCalledWith("month");
  });

  it("reads again after the cache is forgotten", async () => {
    vi.mocked(replaySummary).mockResolvedValue(summary);
    await loadReplay("all");
    forgetReplayCache();
    await loadReplay("all");
    expect(replaySummary).toHaveBeenCalledTimes(2);
  });

  it("builds the week period from the journal every time", async () => {
    vi.mocked(replayJournal).mockResolvedValue([]);
    const week = await loadReplay("week", new Date(2026, 10, 9, 20));
    await loadReplay("week", new Date(2026, 10, 9, 20));
    expect(replayJournal).toHaveBeenCalledTimes(2);
    expect(replaySummary).not.toHaveBeenCalled();
    expect(week.period).toBe("week");
    expect(week.totalMs).toBe(0);
  });

  it("passes a failed read through to the caller", async () => {
    vi.mocked(replaySummary).mockRejectedValue(new Error("locked"));
    await expect(loadReplay("year")).rejects.toThrow("locked");
  });
});

describe("useListeningNow", () => {
  it("is true only while a song that is not a podcast episode plays", () => {
    usePlayer.setState({ playing: true, queue: [song], index: 0 });
    const { result, rerender } = renderHook(() => useListeningNow());
    expect(result.current).toBe(true);

    usePlayer.setState({ queue: [{ ...song, episode: true }] });
    rerender();
    expect(result.current).toBe(false);

    usePlayer.setState({ playing: false, queue: [song] });
    rerender();
    expect(result.current).toBe(false);
  });
});
