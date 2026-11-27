import { describe, expect, it } from "vitest";
import { fs, SRC_DIR } from "./testFiles";

function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = `${dir}${name}`;
    if (fs.statSync(path).isDirectory()) return walk(`${path}/`);
    return [path];
  });
}

const sources = walk(SRC_DIR)
  .filter((path) => /\.(tsx?|css)$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map((path) => ({
    file: path.slice(SRC_DIR.length).split("\\").join("/"),
    text: fs.readFileSync(path, "utf8"),
  }));

const everywhere = () => true;
const selectedChip =
  /\b(filter|scope|chip)\w*\s*===?[^?\n]*\?\s*["'`][^"'`\n]*\bbg-(primary|accent)\b|\bactive\s*\?\s*["'`][^"'`\n]*\bbg-(primary|accent)\b/i;
const inPhoneOrViews = (file: string) => file.startsWith("components/phone/") || file.startsWith("views/");
const inSettings = (file: string) => file.startsWith("views/settings/") || file === "views/SettingsView.tsx";

function lineHits(pattern: RegExp, filter: (file: string) => boolean = everywhere): string[] {
  const hits: string[] = [];
  for (const { file, text } of sources) {
    if (!filter(file)) continue;
    text.split("\n").forEach((line, index) => {
      if (pattern.test(line)) hits.push(`${file}:${index + 1}  ${line.trim()}`);
    });
  }
  return hits;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function tagEnd(src: string, start: number): number {
  let depth = 0;
  let quote = "";
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
    } else if (ch === ">" && depth === 0) {
      return i;
    }
  }
  return -1;
}

function braceEnd(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

type Verdict = "labelled" | "unlabelled" | "undecided";

function contentVerdict(content: string): Verdict {
  let hasText = false;
  let hasExpression = false;
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (/\s/.test(ch)) {
      i += 1;
    } else if (ch === "<" && content[i + 1] === "/") {
      i = content.indexOf(">", i) + 1;
    } else if (ch === "<") {
      const name = /^<([A-Za-z][\w.]*)/.exec(content.slice(i))?.[1] ?? "";
      const end = tagEnd(content, i);
      if (end === -1) return "undecided";
      const selfClosing = content[end - 1] === "/";
      if (name === "svg") {
        if (selfClosing) {
          i = end + 1;
        } else {
          const close = content.indexOf("</svg>", end);
          if (close === -1) return "undecided";
          i = close + "</svg>".length;
        }
      } else if (/^[A-Z]/.test(name)) {
        if (!selfClosing) return "undecided";
        i = end + 1;
      } else {
        hasText = true;
        i = end + 1;
      }
    } else if (ch === "{") {
      const end = braceEnd(content, i);
      if (end === -1) return "undecided";
      hasExpression = true;
      i = end + 1;
    } else {
      hasText = true;
      i += 1;
    }
  }
  if (hasText) return "labelled";
  return hasExpression ? "undecided" : "unlabelled";
}

describe("design guard", () => {
  it("has no orange anywhere in src", () => {
    const hits = lineHits(/d54120|ff6b4a|255[ ,]+107[ ,]+74\b|213[ ,]+65[ ,]+32\b|\borange-[a-z0-9]/i);
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("has no green anywhere in src", () => {
    const hits = lineHits(/1db954|\bgreen-[a-z0-9]|\bemerald-[a-z0-9]|--safe\b/i);
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("has no divider lines between rows", () => {
    const hits = lineHits(/\bdivide-[xy]\b/);
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("never sets content in ALL CAPS in the phone and view code", () => {
    const hits = lineHits(/\buppercase\b/, inPhoneOrViews);
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("labels every icon-only button in the phone UI", () => {
    const hits: string[] = [];
    for (const { file, text } of sources) {
      if (!file.startsWith("components/phone/") || !file.endsWith(".tsx")) continue;
      for (const match of text.matchAll(/<button(?=[\s>/])/g) as Iterable<RegExpMatchArray>) {
        const start = match.index ?? 0;
        const end = tagEnd(text, start);
        if (end === -1) continue;
        const openTag = text.slice(start, end + 1);
        if (/\baria-label(ledby)?=/.test(openTag)) continue;
        const line = lineOf(text, start);
        if (text[end - 1] === "/") {
          hits.push(`${file}:${line}  ${openTag.trim()}`);
          continue;
        }
        const close = text.indexOf("</button>", end);
        if (close === -1) continue;
        if (contentVerdict(text.slice(end + 1, close)) === "unlabelled") {
          hits.push(`${file}:${line}  ${openTag.trim()}`);
        }
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("has no boxed setting groups", () => {
    const hits: string[] = [];
    for (const { file, text } of sources) {
      if (!inSettings(file)) continue;
      for (const match of text.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)) {
        const literal = match[0];
        if (/\brounded-/.test(literal) && /\bbg-elevated\b|\bbg-ink-1\/\[/.test(literal)) {
          hits.push(`${file}:${lineOf(text, match.index ?? 0)}  ${literal.trim()}`);
        }
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("keeps selected filter and scope chips neutral, not accent", () => {
    const hits = lineHits(selectedChip);
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("matches the accent chip strings the selected-chip guard must catch", () => {
    expect(selectedChip.test('filter === tab.filter ? "bg-primary text-on-primary"')).toBe(true);
    expect(selectedChip.test('scope === tab.scope ? "bg-accent text-on-accent"')).toBe(true);
    expect(selectedChip.test('active ? "bg-primary text-on-primary"')).toBe(true);
    expect(selectedChip.test('selected ? "bg-accent text-on-accent"')).toBe(false);
    expect(selectedChip.test('? "bg-primary text-on-primary" : "bg-accent"')).toBe(false);
  });
});
