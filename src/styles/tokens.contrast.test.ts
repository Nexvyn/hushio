import { describe, expect, it } from "vitest";
import css from "./tokens.css?raw";

function themeTokens(header: string): Record<string, [number, number, number]> {
  const start = css.indexOf(header);
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  const tokens: Record<string, [number, number, number]> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return tokens;
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((value) => {
    const x = value / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const tokens = themeTokens(':root,\n:root[data-theme="dark"] {');
const lightTokens = themeTokens(':root[data-theme="light"] {');

describe("dark theme token contrast", () => {
  it.each([
    ["ink-1", "base"],
    ["ink-1", "surface"],
    ["ink-2", "base"],
    ["ink-2", "surface"],
    ["ink-3", "base"],
    ["ink-3", "surface"],
  ] as const)("%s on %s reaches 4.5:1", (ink, ground) => {
    expect(contrast(tokens[ink], tokens[ground])).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["on-accent", "accent"],
    ["on-primary", "primary"],
  ] as const)("%s on %s reaches 4.5:1", (text, ground) => {
    expect(contrast(tokens[text], tokens[ground])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["base", "surface"] as const)("light ink-3 on %s reaches 4.5:1", (ground) => {
    expect(contrast(lightTokens["ink-3"], lightTokens[ground])).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the ink steps ordered: ink-1 > ink-2 > ink-3", () => {
    expect(luminance(tokens["ink-1"])).toBeGreaterThan(luminance(tokens["ink-2"]));
    expect(luminance(tokens["ink-2"])).toBeGreaterThan(luminance(tokens["ink-3"]));
  });
});
