import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImportGlyph, type GlyphKind } from "./importGlyphs";

afterEach(cleanup);

const KINDS: GlyphKind[] = ["stream", "youtube", "file-in", "file-out", "paste"];
const MOTION = "[style*='animation'], [style*='transform'], [class*='bt-']";

describe("import method glyph", () => {
  it.each(KINDS)("renders %s as a static glyph with no animation", (kind) => {
    const { container } = render(createElement(ImportGlyph, { kind, phone: false }));
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector(MOTION)).toBeNull();
  });

  it("renders the phone glyph without animation", () => {
    const { container } = render(createElement(ImportGlyph, { kind: "file-in", phone: true }));
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector(MOTION)).toBeNull();
  });
});
