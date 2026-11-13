import { describe, expect, it } from "vitest";
import { fs, SRC_DIR } from "./lib/testFiles";

function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const path = `${dir}${name}`;
    if (fs.statSync(path).isDirectory()) return walk(`${path}/`);
    return [path];
  });
}

const sources = walk(SRC_DIR)
  .filter((path) => /\.(css|tsx?)$/.test(path) && !/\.test\.tsx?$/.test(path))
  .map((path) => ({ file: path.slice(SRC_DIR.length), text: fs.readFileSync(path, "utf8") }));

const NON_VISIBLE_FOCUS = /(?<![\w-])focus:(ring|outline|border)/;

describe("focus styling", () => {
  it("uses only focus-visible variants for ring, outline and border", () => {
    const offenders = sources.filter((source) => NON_VISIBLE_FOCUS.test(source.text)).map((source) => source.file);
    expect(offenders).toEqual([]);
  });

  it("hides outlines on mouse focus and keeps a 60% keyboard ring", () => {
    const css = sources.find((source) => source.file === "index.css")?.text ?? "";
    expect(css).toContain(":focus:not(:focus-visible)");
    expect(css).toContain("rgb(var(--focus) / 0.6)");
    expect(css).toMatch(/textarea:focus-visible \{\s*outline: none;/);
  });
});
