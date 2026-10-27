import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ImportSong } from "./importParse";
import type { SearchSong } from "./searchParse";

const { matchSong } = vi.hoisted(() => ({ matchSong: vi.fn() }));

vi.mock("./importMatch", () => ({ matchSong }));

import { MATCH_WORKERS, useSongMatches } from "./importMatches";

const song = (index: number): ImportSong => ({ title: `Song ${index}`, artist: "Band", duration: 100 });
const track = (id: string): SearchSong => ({
  id,
  title: id,
  artist: "Band",
  thumb: null,
  album: null,
  duration: 100,
  explicit: false,
  isVideo: false,
  artistId: null,
  albumId: null,
});

function delay<T>(value: T, ms = 1): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("useSongMatches", () => {
  it("reports matched, missing and failed songs by position", async () => {
    const songs = [song(0), song(1), song(2)];
    matchSong.mockImplementation(async (item: ImportSong) => {
      if (item.title === "Song 0") return delay(track("found"));
      if (item.title === "Song 1") return delay(null);
      throw new Error("offline");
    });

    const { result } = renderHook(() => useSongMatches(songs, "", 0));
    await waitFor(() => expect(result.current.filter(Boolean)).toHaveLength(3));
    expect(result.current[0]).toEqual({ status: "matched", track: track("found") });
    expect(result.current[1]).toEqual({ status: "missing" });
    expect(result.current[2]).toEqual({ status: "failed" });
  });

  it("never runs more than four matches at once", async () => {
    let active = 0;
    let peak = 0;
    matchSong.mockReset();
    matchSong.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await delay(null, 5);
      active -= 1;
      return null;
    });
    const songs = Array.from({ length: 10 }, (_, index) => song(index));
    const { result } = renderHook(() => useSongMatches(songs, "tamil", 0));
    await waitFor(() => expect(result.current.filter(Boolean)).toHaveLength(10));
    expect(peak).toBe(MATCH_WORKERS);
    expect(matchSong).toHaveBeenCalledWith(songs[0], "tamil");
  });

  it("starts the matching again when the attempt changes", async () => {
    matchSong.mockReset();
    matchSong.mockResolvedValue(null);
    const songs = [song(7)];
    const { result, rerender } = renderHook(({ attempt }) => useSongMatches(songs, "", attempt), {
      initialProps: { attempt: 0 },
    });
    await waitFor(() => expect(result.current[0]).toEqual({ status: "missing" }));
    rerender({ attempt: 1 });
    await waitFor(() => expect(matchSong).toHaveBeenCalledTimes(2));
  });

  it("returns nothing for an empty list", () => {
    matchSong.mockReset();
    const { result } = renderHook(() => useSongMatches([], "", 0));
    expect(result.current).toEqual([]);
    expect(matchSong).not.toHaveBeenCalled();
  });
});
