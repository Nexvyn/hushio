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

  it("shows zero minutes for silence", () => {
    expect(fmtHours(0)).toBe("0 min");
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

  it("reports no active days or run for empty input", () => {
    expect(streaks([])).toEqual({ active: 0, longest: 0 });
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

describe("streaks across gaps", () => {
  it("counts only consecutive days toward the longest run", () => {
    const days = ["2026-11-01", "2026-11-02", "2026-11-04", "2026-11-05", "2026-11-06"].map((date) => ({ date, ms: 1000 }));
    expect(streaks(days)).toEqual({ active: 5, longest: 3 });
  });

  it("ignores days with no listening time", () => {
    const days = [
      { date: "2026-11-01", ms: 1000 },
      { date: "2026-11-02", ms: 0 },
      { date: "2026-11-03", ms: 1000 },
    ];
    expect(streaks(days)).toEqual({ active: 2, longest: 1 });
  });

  it("counts a duplicated date once", () => {
    const days = [
      { date: "2026-11-01", ms: 1000 },
      { date: "2026-11-01", ms: 2000 },
    ];
    expect(streaks(days)).toEqual({ active: 1, longest: 1 });
  });

  it("is not thrown off by unsorted input", () => {
    const days = ["2026-11-03", "2026-11-01", "2026-11-02"].map((date) => ({ date, ms: 1000 }));
    expect(streaks(days).longest).toBe(3);
  });
});

describe("streakNow edge cases", () => {
  it("keeps the streak alive when today is empty but yesterday was heard", () => {
    const days = [
      { date: "2026-11-07", ms: 1000 },
      { date: "2026-11-08", ms: 1000 },
    ];
    expect(streakNow(days, today, false)).toEqual({ current: 2, heardToday: false, best: 2 });
  });

  it("drops to zero after a full missed day", () => {
    const days = [{ date: "2026-11-07", ms: 1000 }];
    expect(streakNow(days, today, false).current).toBe(0);
  });

  it("counts today as heard while a song is playing", () => {
    const days = [{ date: "2026-11-08", ms: 1000 }];
    expect(streakNow(days, today, true)).toEqual({ current: 2, heardToday: true, best: 2 });
  });

  it("reports a longer past run as best", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-11-09"].map((date) => ({ date, ms: 1000 }));
    expect(streakNow(days, today, false)).toEqual({ current: 1, heardToday: true, best: 3 });
  });
});

describe("biggestDay and peakHour ties", () => {
  it("keeps the earlier day when two days tie", () => {
    const days = [
      { date: "2026-11-01", ms: 5000 },
      { date: "2026-11-02", ms: 5000 },
    ];
    expect(biggestDay(days)?.date).toBe("2026-11-01");
  });

  it("returns null when nothing was heard", () => {
    expect(biggestDay([{ date: "2026-11-01", ms: 0 }])).toBeNull();
  });

  it("keeps the earlier hour when two hours tie", () => {
    const hours = new Array<number>(24).fill(0);
    hours[8] = 100;
    hours[20] = 100;
    expect(peakHour(hours)).toBe(8);
  });
});

describe("journalReplay ordering and window", () => {
  const at = (day: number, hour = 10) => new Date(2026, 10, day, hour);

  it("ranks songs by listening time, longest first", () => {
    const entries = [
      entry("a", "Short", "X", at(8), 60),
      entry("b", "Long", "X", at(8, 12), 300),
      entry("a", "Short", "X", at(9, 8), 30),
    ];
    expect(journalReplay(entries, today).tracks.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("counts each play of the same song", () => {
    const entries = [entry("a", "Song", "X", at(8), 60), entry("a", "Song", "X", at(9, 8), 60)];
    const row = journalReplay(entries, today).tracks[0];
    expect(row.plays).toBe(2);
    expect(row.ms).toBe(120_000);
  });

  it("leaves out plays older than the seven day window", () => {
    const entries = [entry("old", "Old", "X", at(1), 60), entry("new", "New", "X", at(8), 60)];
    expect(journalReplay(entries, today).tracks.map((row) => row.id)).toEqual(["new"]);
  });

  it("leaves out plays that end in the future", () => {
    const entries = [entry("later", "Later", "X", at(9, 23), 60)];
    expect(journalReplay(entries, today).plays).toBe(0);
  });
});
