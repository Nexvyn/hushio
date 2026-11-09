import { describe, expect, it } from "vitest";
import { phoneBottomPad, TABS, tabFor } from "./phoneNav";

describe("TABS", () => {
  it("has five tabs in the PRD order", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["home", "search", "library", "downloads", "settings"]);
  });
});

describe("tabFor", () => {
  it("maps each view to its tab", () => {
    expect(tabFor({ name: "home" })).toBe("home");
    expect(tabFor({ name: "explore" })).toBe("home");
    expect(tabFor({ name: "search" })).toBe("search");
    expect(tabFor({ name: "library", param: "liked" })).toBe("library");
    expect(tabFor({ name: "playlist", param: "p1" })).toBe("library");
    expect(tabFor({ name: "album", param: "a1" })).toBe("library");
    expect(tabFor({ name: "replay" })).toBe("library");
    expect(tabFor({ name: "downloads" })).toBe("downloads");
    expect(tabFor({ name: "settings" })).toBe("settings");
  });
});

describe("phoneBottomPad", () => {
  it("pads for the tab bar alone without a mini player", () => {
    expect(phoneBottomPad(false)).toContain("calc(64px +");
  });

  it("adds the 64 dp mini player and 8 dp gap when it shows", () => {
    expect(phoneBottomPad(true)).toContain("calc(136px +");
  });
});
