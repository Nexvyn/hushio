import { describe, expect, it } from "vitest";
import app from "./App.tsx?raw";

describe("App shell", () => {
  it("separates the base shell from the content surface", () => {
    const shell = app.match(/<div\s+spellCheck=\{false\}\s+className="([^"]*)"/);
    expect(shell?.[1].split(" ")).toContain("bg-base");
    expect(shell?.[1].split(" ")).not.toContain("bg-surface");
  });

  it("hides the main view scrollbar while keeping it scrollable", () => {
    const scroller = app.match(/<EdgeFades id="view-scroll" className="([^"]*)"/);
    expect(scroller?.[1].split(" ")).toContain("no-scrollbar");
    expect(scroller?.[1].split(" ")).toContain("h-full");
  });

  it("keeps the player bar as the last shell child below a shrinkable content row", () => {
    const row = app.match(/<div className="([^"]*gap-2[^"]*)">\s*<Sidebar/);
    expect(row?.[1].split(" ")).toEqual(expect.arrayContaining(["min-h-0", "flex-1", "overflow-hidden", "pb-2"]));
    expect(app.indexOf("<PlayerBar />")).toBeGreaterThan(app.indexOf("<Sidebar"));
    const shell = app.match(/<div\s+spellCheck=\{false\}\s+className="([^"]*)"/);
    expect(shell?.[1].split(" ")).toEqual(expect.arrayContaining(["h-screen", "flex-col", "overflow-hidden"]));
  });
});
