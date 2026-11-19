import { describe, expect, it } from "vitest";
import { groupHistory, historyTracks, isSamePlay, playKey, sortNewestFirst } from "./history";
import type { JournalEntry } from "./replay";

const NOW = new Date(2026, 10, 19, 12, 0);

function play(id: string, at: Date): JournalEntry {
  return { track: { id, title: `Title ${id}`, artist: "Artist", thumb: null }, at: at.getTime(), heard: 90 };
}

describe("groupHistory", () => {
  const today = play("t1", new Date(2026, 10, 19, 9, 30));
  const todayLater = play("t2", new Date(2026, 10, 19, 11, 45));
  const yesterday = play("y1", new Date(2026, 10, 18, 23, 10));
  const earlier = play("e1", new Date(2026, 10, 10, 8, 0));

  it("lists the newest play first, in groups of the same day", () => {
    const groups = groupHistory([today, earlier, yesterday, todayLater], NOW);
    expect(groups.map((group) => group.label).slice(0, 2)).toEqual(["Today", "Yesterday"]);
    expect(groups[0].entries.map((entry) => entry.track.id)).toEqual(["t2", "t1"]);
    expect(groups[1].entries.map((entry) => entry.track.id)).toEqual(["y1"]);
    expect(groups.flatMap((group) => group.entries).map((entry) => entry.track.id)).toEqual(["t2", "t1", "y1", "e1"]);
  });

  it("labels an older day with its date rather than Today or Yesterday", () => {
    const groups = groupHistory([earlier], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).not.toBe("Today");
    expect(groups[0].label).not.toBe("Yesterday");
    expect(groups[0].label.length).toBeGreaterThan(0);
  });

  it("returns no groups for an empty history", () => {
    expect(groupHistory([], NOW)).toEqual([]);
  });
});

describe("history helpers", () => {
  it("sorts a copy without touching the original order", () => {
    const entries = [play("a", new Date(2026, 10, 1)), play("b", new Date(2026, 10, 3))];
    expect(sortNewestFirst(entries).map((entry) => entry.track.id)).toEqual(["b", "a"]);
    expect(entries.map((entry) => entry.track.id)).toEqual(["a", "b"]);
  });

  it("turns plays into queue tracks", () => {
    const [track] = historyTracks([play("a", NOW)]);
    expect(track).toEqual({ id: "a", title: "Title a", artist: "Artist", thumb: null });
  });

  it("identifies one play by its time and song", () => {
    const entry = play("a", NOW);
    expect(isSamePlay(entry, play("a", NOW))).toBe(true);
    expect(isSamePlay(entry, play("b", NOW))).toBe(false);
    expect(playKey(entry)).toEqual({ at: NOW.getTime(), id: "a" });
  });
});
