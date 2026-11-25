import { describe, expect, it } from "vitest";
import { isTabRoot, phoneBottomBlock, phoneBottomPad, TABS, tabOfRoot, tabRoot } from "./phoneNav";

describe("TABS", () => {
  it("has Home, Search and Library", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["home", "search", "library"]);
  });
});

describe("tabOfRoot", () => {
  it("maps only tab roots to their tab", () => {
    expect(tabOfRoot({ name: "home" })).toBe("home");
    expect(tabOfRoot({ name: "library" })).toBe("library");
    expect(tabOfRoot({ name: "library", param: "liked" })).toBeNull();
    expect(tabOfRoot({ name: "album", param: "a1" })).toBeNull();
    expect(tabOfRoot({ name: "daylist" })).toBeNull();
    expect(tabOfRoot({ name: "charts" })).toBeNull();
  });
});

describe("phoneBottomBlock", () => {
  it("covers the tab bar alone without a mini player", () => {
    expect(phoneBottomBlock(false)).toContain("calc(64px +");
  });

  it("includes the joined player and dock clearance", () => {
    expect(phoneBottomBlock(true)).toContain("calc(120px +");
  });
});

describe("phoneBottomPad", () => {
  it("leaves room above the block for the last item", () => {
    expect(phoneBottomPad(false)).toContain("calc(80px +");
    expect(phoneBottomPad(true)).toContain("calc(136px +");
  });
});

describe("tab roots", () => {
  it("treats Home, Search and Library as roots only", () => {
    expect(isTabRoot({ name: "home" })).toBe(true);
    expect(isTabRoot({ name: "charts" })).toBe(false);
    expect(isTabRoot({ name: "search" })).toBe(true);
    expect(isTabRoot({ name: "library" })).toBe(true);
    expect(isTabRoot({ name: "playlist", param: "p1" })).toBe(false);
    expect(isTabRoot({ name: "library", param: "liked" })).toBe(false);
    expect(isTabRoot({ name: "daylist" })).toBe(false);
  });

  it("returns the root view of a tab", () => {
    expect(tabRoot("library")).toEqual({ name: "library" });
  });
});
