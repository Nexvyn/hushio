import { describe, expect, it } from "vitest";
import { navDirection, type NavSnapshot } from "./navDirection";
import type { TabId } from "./phoneNav";

const snap = (name: NavSnapshot["view"]["name"], past: number, future = 0, tab: TabId = "home", param?: string): NavSnapshot => ({
  view: { name, param },
  past,
  future,
  tab,
});

describe("navDirection", () => {
  it("is a push when a view opens on top of the history", () => {
    expect(navDirection(snap("library", 1, 0, "library"), snap("playlist", 2, 0, "library", "p1"))).toBe("push");
  });

  it("is a pop when the history shrinks", () => {
    expect(navDirection(snap("playlist", 2, 0, "library", "p1"), snap("library", 1, 1, "library"))).toBe("pop");
  });

  it("is a tab switch when a different tab root is opened", () => {
    expect(navDirection(snap("home", 0), snap("search", 1, 0, "search"))).toBe("tab");
    expect(navDirection(snap("playlist", 3, 0, "library", "p1"), snap("settings", 4, 0, "library"))).toBe("push");
  });

  it("stays a push for a sub-view of another tab", () => {
    expect(navDirection(snap("home", 0), snap("album", 1, 0, "search", "a1"))).toBe("push");
  });

  it("is none when nothing changed or the view was replaced in place", () => {
    expect(navDirection(snap("home", 0), snap("home", 0))).toBe("none");
    expect(navDirection(snap("home", 1), snap("search", 1, 0, "search"))).toBe("none");
  });
});
