import { describe, expect, it } from "vitest";

const sources = import.meta.glob(["../**/*.{ts,tsx,css}", "!../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function linesMatching(pattern: RegExp, skip?: RegExp) {
  return Object.entries(sources).flatMap(([file, text]) =>
    text
      .split("\n")
      .filter((line) => pattern.test(line) && !(skip && skip.test(line)))
      .map((line) => `${file}: ${line.trim()}`),
  );
}

describe("design scan of src", () => {
  it("has no uppercase tracked eyebrow labels", () => {
    expect(linesMatching(/\buppercase\b/, /^(?!.*tracking-)/)).toEqual([]);
  });

  it("has no hatch or repeating diagonal gradients", () => {
    expect(linesMatching(/repeating-linear-gradient|hatch/i)).toEqual([]);
  });

  it("scans a non-empty set of sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });
});
