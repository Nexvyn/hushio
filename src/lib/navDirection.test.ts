import { describe, expect, it } from "vitest";
import { navDirection, type NavSnapshot } from "./navDirection";

const snap = (name: NavSnapshot["view"]["name"], past: number, future = 0, param?: string): NavSnapshot => ({
  view: { name, param },
  past,
  future,
});

describe("navDirection", () => {
  it("is a push when a view opens on top of the history", () => {
    expect(navDirection(snap("library", 1), snap("playlist", 2, 0, "p1"))).toBe("push");
  });

  it("is a pop when the history shrinks", () => {
    expect(navDirection(snap("playlist", 2, 0, "p1"), snap("library", 1, 1))).toBe("pop");
  });

  it("is a tab switch when a different tab root is opened", () => {
    expect(navDirection(snap("home", 0), snap("search", 1))).toBe("tab");
    expect(navDirection(snap("playlist", 3, 0, "p1"), snap("settings", 4))).toBe("push");
  });

  it("stays a push for a sub-view of another tab", () => {
    expect(navDirection(snap("home", 0), snap("album", 1, 0, "a1"))).toBe("push");
  });

  it("is none when nothing changed or the view was replaced in place", () => {
    expect(navDirection(snap("home", 0), snap("home", 0))).toBe("none");
    expect(navDirection(snap("home", 1), snap("search", 1))).toBe("none");
  });
});
