import { describe, expect, it } from "vitest";
import app from "./App.tsx?raw";

describe("App shell", () => {
  it("paints the shell with the panel surface colour", () => {
    const shell = app.match(/<div\s+spellCheck=\{false\}\s+className="([^"]*)"/);
    expect(shell?.[1].split(" ")).toContain("bg-surface");
    expect(shell?.[1].split(" ")).not.toContain("bg-base");
  });

  it("hides the main view scrollbar while keeping it scrollable", () => {
    const scroller = app.match(/<EdgeFades id="view-scroll" className="([^"]*)"/);
    expect(scroller?.[1].split(" ")).toContain("no-scrollbar");
    expect(scroller?.[1].split(" ")).toContain("h-full");
  });
});
