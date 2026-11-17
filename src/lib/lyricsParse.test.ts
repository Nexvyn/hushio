import { describe, expect, it } from "vitest";
import { parseClock, parseEnhancedLrc, parseLrc, parsePlainText, parseTtml } from "./lyricsParse";

const TTML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body><div>
    <p begin="00:00:01.000" end="00:00:03.500" ttm:agent="v1">
      <span begin="00:00:01.000" end="00:00:01.500">Hello</span> <span begin="00:00:01.500" end="00:00:02.000">world</span>
      <span ttm:role="x-roman">heh-lo wurld</span>
      <span ttm:role="x-translation">Bonjour</span>
    </p>
    <p begin="00:00:04.000" end="00:00:05.000">
      <span begin="00:00:04.000" end="00:00:05.000">Second &amp; last</span>
    </p>
    <p begin="00:00:05.500" end="00:00:06.000">
      <span begin="00:00:05.500" end="00:00:06.000">main</span>
      <span ttm:role="x-bg" begin="00:00:05.500" end="00:00:06.000">(echo)</span>
    </p>
    <p begin="00:00:07.000" end="00:00:08.000">
      <span>Untimed words</span>
    </p>
  </div></body>
</tt>`;

describe("parseClock", () => {
  it.each([
    ["01:02.5", 62.5],
    ["1:02:03.25", 3723.25],
    ["12.5", 12.5],
    ["00:00:01.000", 1],
  ])("reads %s as %d seconds", (input, seconds) => {
    expect(parseClock(input)).toBeCloseTo(seconds, 5);
  });

  it("returns null for text that is not a time", () => {
    expect(parseClock("abc")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
});

describe("parseLrc", () => {
  it("expands multiple stamps on one line and sorts by time", () => {
    const lines = parseLrc("[00:05.50][00:01.00]Repeated line\n[00:03.00]Middle");
    expect(lines).toEqual([
      { time: 1, text: "Repeated line" },
      { time: 3, text: "Middle" },
      { time: 5.5, text: "Repeated line" },
    ]);
  });

  it("skips header tags, blank bodies and inline word stamps", () => {
    const lines = parseLrc("[ar: Artist]\n[ti: Title]\n[00:02.000]\n[00:04.250]<00:04.250>Word stamps <00:04.800>here");
    expect(lines).toEqual([{ time: 4.25, text: "Word stamps here" }]);
  });

  it("reads hour-less minutes with three fraction digits", () => {
    expect(parseLrc("[12:00.125]Late")).toEqual([{ time: 720.125, text: "Late" }]);
  });

  it("reads stamps without hundredths and CRLF line endings", () => {
    expect(parseLrc("[00:05]Five\r\n[00:07.5]Seven\r\n")).toEqual([
      { time: 5, text: "Five" },
      { time: 7.5, text: "Seven" },
    ]);
  });
});

describe("parseEnhancedLrc", () => {
  it("builds words from word stamps and glues fragments with no space", () => {
    const [line] = parseEnhancedLrc("[00:01.00]<00:01.00>Hel<00:01.50>lo <00:02.00>world");
    expect(line.time).toBe(1);
    expect(line.text).toBe("Hello world");
    expect(line.words).toEqual([
      { start: 1, end: 2, text: "Hello" },
      { start: 2, end: 2.8, text: "world" },
    ]);
    expect(line.end).toBeCloseTo(2.8, 5);
  });

  it("keeps plain lines that have no word stamps", () => {
    expect(parseEnhancedLrc("[00:09.00]Plain line")).toEqual([{ time: 9, text: "Plain line" }]);
  });

  it("sorts lines by their start time", () => {
    const lines = parseEnhancedLrc("[00:04.00]<00:04.00>Later\n[00:01.00]<00:01.00>Early");
    expect(lines.map((line) => line.text)).toEqual(["Early", "Later"]);
  });

  it("handles CRLF endings and a word stamp that opens a space-led fragment", () => {
    const lines = parseEnhancedLrc("[00:01.00]<00:01.00>Hi <00:01.50>there\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hi there");
    expect(lines[0].words?.map((word) => [word.start, word.end, word.text])).toEqual([
      [1, 1.5, "Hi"],
      [1.5, expect.closeTo(2.3, 5), "there"],
    ]);
  });
});

describe("parseTtml", () => {
  it("reads timed words, the transliteration and the background line", () => {
    const lines = parseTtml(TTML_FIXTURE);
    expect(lines.map((line) => line.text)).toEqual(["Hello world", "Second & last", "main", "Untimed words"]);

    const [first] = lines;
    expect(first.time).toBe(1);
    expect(first.end).toBe(3.5);
    expect(first.words).toEqual([
      { start: 1, end: 1.5, text: "Hello" },
      { start: 1.5, end: 2, text: "world" },
    ]);
    expect(first.roman).toBe("heh-lo wurld");
    expect(first.translation).toBe("Bonjour");
    expect(first.bg).toBeUndefined();
    expect(lines[1].translation).toBeUndefined();

    expect(lines[2].bg).toEqual({ text: "(echo)", words: [{ start: 5.5, end: 6, text: "(echo)" }] });
  });

  it("keeps a translation on the line it belongs to, even when the source words are untimed", () => {
    const xml = `<tt xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div>
      <p begin="00:00:02.000" end="00:00:04.000">
        <span>Gracias a todos</span>
        <span ttm:role="x-translation">Thanks to everyone</span>
      </p>
    </div></body></tt>`;
    expect(parseTtml(xml)).toEqual([
      { time: 2, end: 4, text: "Gracias a todos", translation: "Thanks to everyone" },
    ]);
  });

  it("keeps an untimed paragraph as one line without words", () => {
    const untimed = parseTtml(TTML_FIXTURE).at(-1);
    expect(untimed).toEqual({ time: 7, end: 8, text: "Untimed words" });
  });

  it("skips paragraphs without a begin time", () => {
    expect(parseTtml(`<tt><body><p><span begin="00:00:01.000" end="00:00:02.000">x</span></p></body></tt>`)).toEqual([]);
  });

  it("ends an untimed paragraph at its last word when the paragraph has no end", () => {
    const [line] = parseTtml(
      `<tt><body><p begin="00:00:02.000"><span begin="00:00:02.000" end="00:00:02.500">Go</span> <span begin="00:00:02.500" end="00:00:03.000">on</span></p></body></tt>`,
    );
    expect(line.end).toBe(3);
  });

  it("joins several roman spans with a space and keeps them out of the line", () => {
    const [line] = parseTtml(
      `<tt><body><p begin="00:00:01.000" end="00:00:02.000"><span begin="00:00:01.000" end="00:00:02.000">단어</span><span ttm:role="x-roman">dan</span><span ttm:role="x-roman">eo</span></p></body></tt>`,
    );
    expect(line.text).toBe("단어");
    expect(line.roman).toBe("dan eo");
  });
});

describe("parsePlainText", () => {
  it("trims lines, drops blanks and metadata tags", () => {
    expect(parsePlainText("  First line  \r\n\n[ar: Someone]\nSecond line\n   \n")).toEqual([
      "First line",
      "Second line",
    ]);
  });

  it("drops a byte order mark on the first line", () => {
    expect(parsePlainText("﻿First\nSecond")).toEqual(["First", "Second"]);
  });
});
