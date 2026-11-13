import { describe, expect, it } from "vitest";
import { isTabRoot, phoneBottomBlock, phoneBottomPad, TABS, tabFor, tabRootFor } from "./phoneNav";

describe("TABS", () => {
  it("has three tabs: Home, Search, Library", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["home", "search", "library"]);
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
    expect(tabFor({ name: "downloads" })).toBe("library");
    expect(tabFor({ name: "settings" })).toBe("home");
  });
});

describe("phoneBottomBlock", () => {
  it("covers the tab bar alone without a mini player", () => {
    expect(phoneBottomBlock(false)).toContain("calc(56px +");
  });

  it("reaches 8px above the mini player when it shows", () => {
    expect(phoneBottomBlock(true)).toContain("calc(128px +");
  });
});

describe("phoneBottomPad", () => {
  it("leaves room above the block for the last item", () => {
    expect(phoneBottomPad(false)).toBe("16px");
    expect(phoneBottomPad(true)).toBe("88px");
  });
});

describe("tab roots", () => {
  it("treats Home, Search and Library as roots only", () => {
    expect(isTabRoot({ name: "home" })).toBe(true);
    expect(isTabRoot({ name: "search" })).toBe(true);
    expect(isTabRoot({ name: "library" })).toBe(true);
    expect(isTabRoot({ name: "playlist", param: "p1" })).toBe(false);
    expect(isTabRoot({ name: "explore" })).toBe(false);
  });

  it("returns the tab root that owns a view", () => {
    expect(tabRootFor({ name: "album", param: "a1" })).toEqual({ name: "library" });
    expect(tabRootFor({ name: "charts" })).toEqual({ name: "home" });
  });
});
