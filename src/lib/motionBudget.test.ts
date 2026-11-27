import { describe, expect, it } from "vitest";
import { DURATION_MS, LOOPING_DURATIONS, MOTION_MAX_MS } from "./motion";
import { fs, SRC_DIR } from "./testFiles";

const KEYFRAME_FILE = "styles/motion.css";

function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = `${dir}${name}`;
    if (fs.statSync(path).isDirectory()) return walk(`${path}/`);
    return [path];
  });
}

const sources = walk(SRC_DIR)
  .filter((path) => /\.(css|tsx)$/.test(path) && !/\.test\.tsx$/.test(path))
  .map((path) => ({
    file: path.slice(SRC_DIR.length).split("\\").join("/"),
    text: fs.readFileSync(path, "utf8"),
  }));

const keyframeCss = sources.find((source) => source.file === KEYFRAME_FILE)?.text ?? "";

const FORBIDDEN_PROPERTY_IN_TRANSITION = [
  /transition-\[[^\]]*\b(top|left|width|height)\b/,
  /transition(?:-property)?\s*[:=]\s*[^;{}]*?\b(top|left|width|height)\b/,
];

const FORBIDDEN_DURATION = [/\bduration-(\d|\[)/, /\b\d+(\.\d+)?ms\b/];

const scriptSources = walk(SRC_DIR)
  .filter((path) => /\.(css|ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map((path) => ({
    file: path.slice(SRC_DIR.length).split("\\").join("/"),
    text: fs.readFileSync(path, "utf8"),
  }));

const LITERAL_SECONDS = /\bduration\s*:\s*\d*\.\d+/;

const LITERAL_SECONDS_TEMPORARY_ALLOW = new Set([
  "lib/toggleMotion.ts:16",
  "lib/toggleMotion.ts:17",
  "lib/toggleMotion.ts:20",
  "lib/toggleMotion.ts:21",
]);

function keyframeBodies(css: string): string[] {
  const bodies: string[] = [];
  let index = css.indexOf("@keyframes");
  while (index !== -1) {
    const open = css.indexOf("{", index);
    let depth = 0;
    let end = open;
    for (; end < css.length; end += 1) {
      if (css[end] === "{") depth += 1;
      if (css[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    bodies.push(css.slice(open + 1, end));
    index = css.indexOf("@keyframes", end);
  }
  return bodies;
}

describe("motion budget (F-285)", () => {
  it("scans the app sources", () => {
    expect(sources.some((source) => source.file === "components/EqBars.tsx")).toBe(true);
    expect(keyframeCss.length).toBeGreaterThan(0);
  });

  it("never transitions top, left, width or height", () => {
    for (const { file, text } of sources) {
      for (const pattern of FORBIDDEN_PROPERTY_IN_TRANSITION) {
        expect(text.match(pattern)?.[0] ?? null, file).toBeNull();
      }
    }
  });

  it("never animates top, left, width or height inside keyframes", () => {
    for (const body of keyframeBodies(keyframeCss)) {
      expect(body).not.toMatch(/\b(top|left|width|height)\s*:/);
    }
  });

  it("animates width or position only for the named sidebar and queue moves", () => {
    const named = [
      { name: "sidebar width", file: "components/Sidebar.tsx", pattern: /animate=\{\{ width: rail \? SIDEBAR_RAIL_PX : SIDEBAR_FULL_PX \}\}/ },
      { name: "queue move", file: "lib/useSortable.ts", pattern: /animate\(row, \{ y: \[delta, 0\] \}/ },
    ];
    const code = walk(SRC_DIR)
      .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path))
      .map((path) => ({
        file: path.slice(SRC_DIR.length).split("\\").join("/"),
        text: fs.readFileSync(path, "utf8"),
      }));
    for (const { name, file, pattern } of named) {
      const source = code.find((item) => item.file === file);
      expect(source?.text.match(pattern) ? 1 : 0, name).toBe(1);
    }
    const geometry = /animate(?:=\{\{|\(\w+, \{)[^}]*\b(width|height|top|left)\s*:/;
    for (const { file, text } of code) {
      if (file === "components/Sidebar.tsx") continue;
      expect(text.match(geometry)?.[0] ?? null, file).toBeNull();
    }
  });

  it("has no literal durations outside the token file and the keyframe file", () => {
    for (const { file, text } of sources) {
      if (file === KEYFRAME_FILE) continue;
      for (const pattern of FORBIDDEN_DURATION) {
        expect(text.match(pattern)?.[0] ?? null, file).toBeNull();
      }
    }
  });

  it("has no literal seconds outside the token file except the temporary allow-list", () => {
    const hits: string[] = [];
    for (const { file, text } of scriptSources) {
      if (file === "lib/motion.ts") continue;
      text.split("\n").forEach((line, index) => {
        if (LITERAL_SECONDS.test(line)) hits.push(`${file}:${index + 1}`);
      });
    }
    expect(hits.filter((hit) => !LITERAL_SECONDS_TEMPORARY_ALLOW.has(hit))).toEqual([]);
    expect([...LITERAL_SECONDS_TEMPORARY_ALLOW].filter((entry) => !hits.includes(entry))).toEqual([]);
  });

  it("uses only known duration tokens in the keyframe file", () => {
    const names = [...keyframeCss.matchAll(/var\(--dur-(\w+)\)/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name in DURATION_MS, name).toBe(true);
    expect(keyframeCss.match(/\b\d+(\.\d+)?m?s\b/)).toBeNull();
  });

  it("keeps every one-shot duration at or under 500 ms", () => {
    for (const [name, ms] of Object.entries(DURATION_MS)) {
      if (LOOPING_DURATIONS.includes(name as keyof typeof DURATION_MS)) continue;
      expect(ms, name).toBeLessThanOrEqual(MOTION_MAX_MS);
    }
  });
});
