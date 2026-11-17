import type { SyncedLyricLine, SyncedLyricWord } from "./bridge";

const LRC_STAMP = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_STAMP = /<(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)/g;
const TAG_LINE = /^\[[a-zA-Z]+:[^\]]*\]$/;
const ENHANCED_TAIL_S = 0.8;

function stampSeconds(minutes: string, seconds: string, fraction?: string): number {
  const base = Number(minutes) * 60 + Number(seconds);
  if (fraction === undefined) return base;
  return base + Number(fraction) / 10 ** fraction.length;
}

export function parseClock(text: string): number | null {
  const match = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (match) {
    const [, hours = "0", minutes, seconds] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  }
  const plain = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(plain) ? plain : null;
}

export function parseLrc(text: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(LRC_STAMP)];
    if (stamps.length === 0) continue;
    const body = raw.slice(stamps.at(-1)!.index! + stamps.at(-1)![0].length).replace(/<[^>]*>/g, "").trim();
    if (body === "") continue;
    for (const stamp of stamps) {
      lines.push({ time: stampSeconds(stamp[1], stamp[2], stamp[3]), text: body });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function parseEnhancedLrc(text: string): SyncedLyricLine[] {
  const result: SyncedLyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const lead = /^\s*\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(raw);
    if (!lead) continue;
    const words: SyncedLyricWord[] = [];
    let pending: { start: number; text: string } | null = null;
    for (const stamp of raw.matchAll(WORD_STAMP)) {
      const piece = stamp[4];
      const trimmed = piece.trim();
      if (/^\s/.test(piece) && pending) {
        words.push({ start: pending.start, end: 0, text: pending.text });
        pending = null;
      }
      if (trimmed !== "") {
        pending ??= { start: stampSeconds(stamp[1], stamp[2], stamp[3]), text: "" };
        pending.text += trimmed;
      }
      if (/\s$/.test(piece) && pending) {
        words.push({ start: pending.start, end: 0, text: pending.text });
        pending = null;
      }
    }
    if (pending) words.push({ start: pending.start, end: 0, text: pending.text });
    if (words.length === 0) {
      const body = raw.slice(lead[0].length).trim();
      if (body !== "") result.push({ time: stampSeconds(lead[1], lead[2], lead[3]), text: body });
      continue;
    }
    words.forEach((word, index) => {
      word.end = words[index + 1]?.start ?? word.start + ENHANCED_TAIL_S;
    });
    result.push({
      time: stampSeconds(lead[1], lead[2], lead[3]),
      text: words.map((word) => word.text).join(" "),
      end: words.at(-1)!.end,
      words,
    });
  }
  return result.sort((a, b) => a.time - b.time);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function attribute(attrs: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1];
}

const TTML_SIDE_ROLE = /<span\b[^>]*ttm:role="x-(?:translation|roman)"[^>]*>[\s\S]*?<\/span>/g;

function plainSpanText(markup: string): string {
  return decodeEntities(markup.replace(/<[^>]*>/g, "")).trim();
}

export function parseTtml(xml: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = [];
  for (const paragraph of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const begin = parseClock(attribute(paragraph[1], "begin") ?? "");
    if (begin === null) continue;
    const words: SyncedLyricWord[] = [];
    const background: SyncedLyricWord[] = [];
    let romanText = "";
    let translationText = "";
    for (const span of paragraph[2].matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/g)) {
      const role = attribute(span[1], "ttm:role");
      const text = plainSpanText(span[2]);
      if (role === "x-roman") {
        romanText += (romanText ? " " : "") + text;
        continue;
      }
      if (role === "x-translation") {
        if (text !== "") translationText += (translationText ? " " : "") + text;
        continue;
      }
      if (text === "") continue;
      const start = parseClock(attribute(span[1], "begin") ?? "");
      const end = parseClock(attribute(span[1], "end") ?? "");
      if (start === null || end === null) continue;
      (role === "x-bg" ? background : words).push({ start, end, text });
    }
    const timed = words.map((word) => word.text).join(" ");
    const backgroundText = background.map((word) => word.text).join(" ");
    const untimed = plainSpanText(paragraph[2].replace(TTML_SIDE_ROLE, ""));
    const text = timed || backgroundText || untimed;
    if (text === "") continue;
    const line: SyncedLyricLine = { time: begin, text };
    const end = parseClock(attribute(paragraph[1], "end") ?? "") ?? words.at(-1)?.end;
    if (end !== undefined && end !== null) line.end = end;
    if (timed !== "" && words.length > 0) line.words = words;
    if (timed !== "" && background.length > 0) line.bg = { text: backgroundText, words: background };
    if (romanText !== "") line.roman = romanText;
    if (translationText !== "") line.translation = translationText;
    lines.push(line);
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function parsePlainText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !TAG_LINE.test(line));
}
