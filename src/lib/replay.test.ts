import { describe, expect, it } from "vitest";
import {
  activityDays,
  biggestDay,
  creditNames,
  fmtHours,
  isoDay,
  journalReplay,
  peakHour,
  periodLabel,
  streakNow,
  streaks,
  type JournalEntry,
} from "./replay";

const today = new Date(2026, 10, 9, 12);

function entry(id: string, title: string, artist: string, at: Date, heard: number, thumb: string | null = null): JournalEntry {
  return { track: { id, title, artist, thumb }, at: at.getTime(), heard };
}

describe("fmtHours", () => {
  it("shows minutes under an hour", () => {
    expect(fmtHours(42 * 60_000)).toBe("42 min");
  });

  it("uses the singular only for exactly one hour", () => {
    expect(fmtHours(3_600_000)).toBe("1 hr");
    expect(fmtHours(3_600_000 * 1.04)).toBe("1 hr");
  });

  it("keeps one decimal below ten hours and rounds above", () => {
    expect(fmtHours(2.5 * 3_600_000)).toBe("2.5 hrs");
    expect(fmtHours(12.4 * 3_600_000)).toBe("12 hrs");
  });

  it("groups thousands", () => {
    expect(fmtHours(1204 * 3_600_000)).toBe(`${(1204).toLocaleString()} hrs`);
  });
});

describe("date windows", () => {
  it("formats local ISO days", () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("builds the seven-day week window ending today", () => {
    const week = activityDays("week", [], today);
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ date: "2026-11-03", ms: 0 });
    expect(week.at(-1)?.date).toBe("2026-11-09");
  });

  it("builds the month window from the first of this month", () => {
    const month = activityDays("month", [], today);
    expect(month).toHaveLength(9);
    expect(month[0].date).toBe("2026-11-01");
  });

  it("builds every day of last month", () => {
    const lastMonth = activityDays("lastMonth", [], today);
    expect(lastMonth).toHaveLength(31);
    expect(lastMonth[0].date).toBe("2026-10-01");
    expect(lastMonth.at(-1)?.date).toBe("2026-10-31");
  });

  it("uses a 28-day window for the year and all periods", () => {
    for (const period of ["year", "all"] as const) {
      const window = activityDays(period, [], today);
      expect(window).toHaveLength(28);
      expect(window[0].date).toBe("2026-10-13");
    }
  });

  it("fills the windows with recorded milliseconds and zero for silent days", () => {
    const window = activityDays("week", [{ date: "2026-11-05", ms: 900 }], today);
    expect(window.find((day) => day.date === "2026-11-05")?.ms).toBe(900);
    expect(window.filter((day) => day.ms === 0)).toHaveLength(6);
  });
});

describe("streaks", () => {
  it("counts active days and the longest run", () => {
    const days = [
      { date: "2026-11-01", ms: 5 },
      { date: "2026-11-02", ms: 5 },
      { date: "2026-11-03", ms: 0 },
      { date: "2026-11-04", ms: 1 },
      { date: "2026-11-05", ms: 1 },
    ];
    expect(streaks(days)).toEqual({ active: 4, longest: 2 });
  });

  it("keeps a run across the end of a month", () => {
    expect(
      streaks([
        { date: "2026-10-31", ms: 1 },
        { date: "2026-11-01", ms: 1 },
      ]).longest,
    ).toBe(2);
  });

  it("returns the current streak counting back from today", () => {
    const days = [
      { date: "2026-11-06", ms: 1 },
      { date: "2026-11-07", ms: 1 },
      { date: "2026-11-08", ms: 1 },
    ];
    expect(streakNow(days, today, false)).toEqual({ current: 3, heardToday: false, best: 3 });
  });

  it("counts music playing right now toward today at once", () => {
    const days = [
      { date: "2026-11-06", ms: 1 },
      { date: "2026-11-07", ms: 1 },
      { date: "2026-11-08", ms: 1 },
    ];
    expect(streakNow(days, today, true)).toEqual({ current: 4, heardToday: true, best: 4 });
  });

  it("reports no streak when nothing was heard recently", () => {
    expect(streakNow([{ date: "2026-10-01", ms: 1 }], today, false)).toEqual({ current: 0, heardToday: false, best: 1 });
  });
});

describe("day and hour picks", () => {
  it("picks the first biggest day and ignores silent days", () => {
    expect(
      biggestDay([
        { date: "2026-11-01", ms: 0 },
        { date: "2026-11-02", ms: 5 },
        { date: "2026-11-03", ms: 5 },
      ]),
    ).toEqual({ date: "2026-11-02", ms: 5 });
    expect(biggestDay([{ date: "2026-11-01", ms: 0 }])).toBeNull();
  });

  it("picks the earliest peak hour", () => {
    expect(peakHour([0, 3, 7, 7, 0])).toBe(2);
    expect(peakHour(new Array(24).fill(0))).toBeNull();
  });
});

describe("credits", () => {
  it("splits shared credits", () => {
    expect(creditNames("A feat. B")).toEqual(["A", "B"]);
    expect(creditNames("Luis Fonsi & Daddy Yankee")).toEqual(["Luis Fonsi", "Daddy Yankee"]);
    expect(creditNames("X, Y ft. Z")).toEqual(["X", "Y", "Z"]);
    expect(creditNames("A featuring B")).toEqual(["A", "B"]);
  });

  it("keeps a single artist whole", () => {
    expect(creditNames("Solo Artist")).toEqual(["Solo Artist"]);
  });
});

describe("period labels", () => {
  it("names each period", () => {
    const now = new Date(2026, 10, 9);
    expect(periodLabel("week", now, [])).toBe("The last seven days");
    expect(periodLabel("month", now, [])).toBe("November 2026");
    expect(periodLabel("lastMonth", now, [])).toBe("October 2026");
    expect(periodLabel("year", now, [])).toBe("2026");
  });

  it("rolls last month back into the previous year", () => {
    expect(periodLabel("lastMonth", new Date(2026, 0, 15), [])).toBe("December 2025");
  });

  it("starts all time from the first recorded month", () => {
    expect(periodLabel("all", today, ["2026-03", "2026-09"])).toBe("Since Mar 2026");
    expect(periodLabel("all", today, [])).toBe("All time");
  });
});

describe("journalReplay", () => {
  const entries = [
    entry("a", "Old", "Dua Lipa", new Date(2026, 10, 3, 10), 60, "thumb-a"),
    entry("a", "New", "Dua Lipa", new Date(2026, 10, 9, 19), 120),
    entry("c", "Unnamed", "", new Date(2026, 10, 5, 12), 30),
    entry("z", "Too old", "Someone", new Date(2026, 9, 30, 12), 999),
    entry("y", "Later", "Someone", new Date(2026, 10, 9, 21), 999),
  ];
  const data = journalReplay(entries, new Date(2026, 10, 9, 20));

  it("counts only the last seven days up to now", () => {
    expect(data.period).toBe("week");
    expect(data.totalMs).toBe(210_000);
    expect(data.plays).toBe(3);
  });

  it("keeps the newest title and thumb for a track and sums its time", () => {
    expect(data.tracks[0]).toEqual({ id: "a", title: "New", artist: "Dua Lipa", thumb: null, ms: 180_000, plays: 2 });
    expect(data.tracks.map((track) => track.id)).toEqual(["a", "c"]);
    expect(data.counts.tracks).toBe(2);
  });

  it("leaves unknown artists out of the artist list but keeps their time", () => {
    expect(data.artists).toEqual([{ name: "Dua Lipa", ms: 180_000, plays: 2 }]);
    expect(data.counts.artists).toBe(1);
    expect(data.albums).toEqual([]);
  });

  it("buckets listening by the local hour and day it started", () => {
    expect(data.hours[9]).toBe(60_000);
    expect(data.hours[18]).toBe(120_000);
    expect(data.hours[11]).toBe(30_000);
    expect(data.days).toEqual([
      { date: "2026-11-03", ms: 60_000 },
      { date: "2026-11-05", ms: 30_000 },
      { date: "2026-11-09", ms: 120_000 },
    ]);
  });
});
