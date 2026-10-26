import { describe, expect, it } from "vitest";
import {
  bySection,
  DEFAULT_TONE,
  FALLBACK_MOODS,
  moodByParams,
  tone,
  type MoodEntry,
} from "./moods";

function mood(title: string, params: string | null, section: string | null = null): MoodEntry {
  return { title, browseId: "FEmusic_moods_and_genres_category", params, color: "#123456", section };
}

describe("tone", () => {
  it("returns the mood colour, or the default accent when there is none", () => {
    expect(tone("#E13300")).toBe("#E13300");
    expect(tone(null)).toBe(DEFAULT_TONE);
  });
});

describe("moodByParams", () => {
  it("finds the mood whose params match", () => {
    const moods = [mood("Focus", "p1"), mood("Chill", "p2")];
    expect(moodByParams(moods, "p2")?.title).toBe("Chill");
  });

  it("returns undefined for unknown params and never matches a null params entry", () => {
    const moods = [mood("Fallback", null)];
    expect(moodByParams(moods, "p1")).toBeUndefined();
    expect(moodByParams(moods, "")).toBeUndefined();
  });
});

describe("bySection", () => {
  it("groups moods under their section in first-seen order", () => {
    const groups = bySection([
      mood("Focus", "p1", "Genres"),
      mood("Chill", "p2", "Moods"),
      mood("Jazz", "p3", "Genres"),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["Genres", "Moods"]);
    expect(groups[0].moods.map((item) => item.title)).toEqual(["Focus", "Jazz"]);
    expect(groups[1].moods.map((item) => item.title)).toEqual(["Chill"]);
  });

  it("puts moods without a section under Moods & genres", () => {
    const groups = bySection([mood("Focus", "p1", null)]);
    expect(groups).toEqual([{ title: "Moods & genres", moods: [mood("Focus", "p1", null)] }]);
  });

  it("returns no groups for an empty list", () => {
    expect(bySection([])).toEqual([]);
  });
});

describe("FALLBACK_MOODS", () => {
  it("lists the eight neutral moods in PRD order, none with browse data", () => {
    expect(FALLBACK_MOODS.map((item) => item.title)).toEqual([
      "Today's hits",
      "Lo-fi beats",
      "Workout energy",
      "Focus flow",
      "Rock classics",
      "Jazz evenings",
      "Pop hits",
      "Chill mix",
    ]);
    for (const item of FALLBACK_MOODS) {
      expect(item.browseId).toBe("");
      expect(item.params).toBeNull();
    }
  });
});
