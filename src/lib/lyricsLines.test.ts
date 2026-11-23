import { describe, expect, it } from "vitest";
import type { SyncedLyricLine } from "./bridge";
import {
  activeLineIndex,
  depthStyle,
  lyricFalloff,
  isSectionLabel,
  resolveWordSpans,
  sweepWindow,
  visibleLyricLines,
  wordPercent,
} from "./lyricsLines";

const line = (time: number, text: string, extra: Partial<SyncedLyricLine> = {}): SyncedLyricLine => ({
  time,
  text,
  ...extra,
});

describe("visibleLyricLines", () => {
  it("drops parenthesised credits and 0:00 credit lines at the start", () => {
    const lines = [
      line(0, "Lyrics by: Someone"),
      line(0.5, "(Written by a writer)"),
      line(3, "First sung line"),
      line(4, "(backing vocals)"),
    ];
    expect(visibleLyricLines(lines).map((item) => item.text)).toEqual([
      "First sung line",
      "(backing vocals)",
    ]);
  });

  it("keeps a bracketed first line that is sung later in the song", () => {
    const lines = [line(12, "(Ooh-ooh)"), line(14, "Next line")];
    expect(visibleLyricLines(lines).map((item) => item.text)).toEqual(["(Ooh-ooh)", "Next line"]);
  });

  it("keeps a bracketed opening line at 0:00 that has no credit words", () => {
    const lines = [line(0, "(Ooh-ooh)"), line(2, "Next line")];
    expect(visibleLyricLines(lines).map((item) => item.text)).toEqual(["(Ooh-ooh)", "Next line"]);
  });

  it("keeps a bracketed section label that opens the song", () => {
    const lines = [line(0, "[Intro]"), line(2, "Opening words")];
    expect(visibleLyricLines(lines).map((item) => item.text)).toEqual(["[Intro]", "Opening words"]);
  });

  it("keeps a 0:00 line that is not a credit", () => {
    expect(visibleLyricLines([line(0, "Ready, set")])).toEqual([line(0, "Ready, set")]);
  });

  it("returns an empty list when every line is a credit", () => {
    expect(visibleLyricLines([line(0, "(Written by)")])).toEqual([]);
  });
});

describe("isSectionLabel", () => {
  it("recognises bracketed headings only", () => {
    expect(isSectionLabel("[Chorus]")).toBe(true);
    expect(isSectionLabel("  [Verse 2]  ")).toBe(true);
    expect(isSectionLabel("[Chorus] and more")).toBe(false);
    expect(isSectionLabel("Chorus")).toBe(false);
  });
});

describe("activeLineIndex", () => {
  const lines = [line(1, "a"), line(2, "b"), line(3, "c")];

  it("returns -1 before the first line", () => {
    expect(activeLineIndex(lines, 0.5)).toBe(-1);
  });

  it("uses the 0.35 s lookahead", () => {
    expect(activeLineIndex(lines, 0.65)).toBe(0);
    expect(activeLineIndex(lines, 0.6)).toBe(-1);
  });

  it("picks the last line that has started", () => {
    expect(activeLineIndex(lines, 2.2)).toBe(1);
    expect(activeLineIndex(lines, 9)).toBe(2);
  });
});

describe("sweepWindow", () => {
  it("runs until the next line starts", () => {
    expect(sweepWindow([line(1, "a"), line(4, "b")], 0)).toEqual([1, 4]);
  });

  it("uses four seconds for the last line", () => {
    expect(sweepWindow([line(10, "a")], 0)).toEqual([10, 14]);
  });

  it("ends at the last word when it finishes early", () => {
    const lines = [line(2, "a", { words: [{ start: 2, end: 2.5, text: "a" }] }), line(9, "b")];
    expect(sweepWindow(lines, 0)).toEqual([2, 3]);
  });

  it("falls back to three seconds when the window is empty", () => {
    expect(sweepWindow([line(5, "a"), line(5, "b")], 0)).toEqual([5, 8]);
  });
});

describe("resolveWordSpans", () => {
  it("keeps sane word times inside the window", () => {
    const words = [
      { start: 1, end: 1.5, text: "one" },
      { start: 1.5, end: 2, text: "two" },
    ];
    expect(resolveWordSpans(words, 1, 3)).toEqual([
      { start: 1, end: 1.5 },
      { start: 1.5, end: 2 },
    ]);
  });

  it("splits the window evenly when a word is out of range", () => {
    const words = [
      { start: 0, end: 1, text: "early" },
      { start: 2, end: 3, text: "ok" },
    ];
    expect(resolveWordSpans(words, 2, 4)).toEqual([
      { start: 2, end: 3 },
      { start: 3, end: 4 },
    ]);
  });

  it("splits an empty word list into one span", () => {
    expect(resolveWordSpans([], 2, 3)).toEqual([{ start: 2, end: 3 }]);
  });

  it("splits the window when a word has zero length", () => {
    expect(resolveWordSpans([{ start: 2, end: 2, text: "x" }], 2, 3)).toEqual([{ start: 2, end: 3 }]);
  });
});

describe("wordPercent", () => {
  const span = { start: 2, end: 4 };

  it("reports progress through the word", () => {
    expect(wordPercent(3, span)).toBe(50);
    expect(wordPercent(1, span)).toBe(0);
    expect(wordPercent(9, span)).toBe(100);
  });

  it("treats a zero-length word as done once its start has passed", () => {
    expect(wordPercent(2, { start: 2, end: 2 })).toBe(100);
    expect(wordPercent(1.9, { start: 2, end: 2 })).toBe(0);
  });
});

describe("lyricFalloff", () => {
  it("keeps the playing line at full opacity with no blur", () => {
    expect(lyricFalloff(0)).toEqual({ opacity: 1, blurPx: 0 });
  });

  it("steps opacity and blur by distance, then holds at four lines", () => {
    expect(lyricFalloff(1)).toEqual({ opacity: 0.8, blurPx: 1 });
    expect(lyricFalloff(-2)).toEqual({ opacity: 0.7, blurPx: 1 });
    expect(lyricFalloff(3)).toEqual({ opacity: 0.58, blurPx: 1.7 });
    expect(lyricFalloff(9)).toEqual({ opacity: 0.46, blurPx: 2.4 });
  });
});

describe("depthStyle", () => {
  it("leaves the active line at full size and opacity", () => {
    expect(depthStyle(0, false, true)).toEqual({ opacity: 1, filter: undefined, transform: "scale(1)" });
  });

  it("blurs lines away from the active line when blur is on", () => {
    expect(depthStyle(2, false, true)).toEqual({ opacity: 0.3, filter: "blur(2.2px)", transform: "scale(0.955)" });
  });

  it("drops the blur when blur is off", () => {
    expect(depthStyle(1, false, false)).toEqual({ opacity: 0.5, filter: undefined, transform: "scale(0.975)" });
  });

  it("dims lines already sung", () => {
    expect(depthStyle(-1, true, false).opacity).toBeCloseTo(0.35, 5);
    expect(depthStyle(1, false, false).opacity).toBe(0.5);
  });

  it("caps the distance at four lines", () => {
    const capped = depthStyle(-10, true, true);
    expect(capped.opacity).toBeCloseTo(0.07, 5);
    expect(capped.filter).toBe("blur(4px)");
    expect(capped.transform).toBe("scale(0.93)");
  });
});
