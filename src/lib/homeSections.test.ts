import { describe, expect, it } from "vitest";
import { HOME_SECTION_KEYS, moveHomeSection, orderHomeSections, toggleHiddenSection } from "./homeSections";
import type { FeedSection } from "./feed";

function section(kind: string): FeedSection {
  return {
    id: kind,
    kind: kind as FeedSection["kind"],
    title: kind,
    layout: "tiles",
    priority: 0,
    items: [],
  };
}

describe("orderHomeSections", () => {
  it("puts the sections in the order the settings give", () => {
    const sections = [section("browse"), section("jump-back-in"), section("stations")];
    const ordered = orderHomeSections(sections, ["stations", "jump-back-in"], []);
    expect(ordered.map((entry) => entry.kind)).toEqual(["stations", "jump-back-in", "browse"]);
  });

  it("keeps the sections with no place in the order at the end", () => {
    const sections = [section("stations"), section("browse")];
    const ordered = orderHomeSections(sections, ["stations"], []);
    expect(ordered.map((entry) => entry.kind)).toEqual(["stations", "browse"]);
  });

  it("hides the sections that are turned off", () => {
    const sections = [section("browse"), section("stations")];
    const ordered = orderHomeSections(sections, [], ["stations"]);
    expect(ordered.map((entry) => entry.kind)).toEqual(["browse"]);
  });

  it("does nothing when there is no order yet", () => {
    const sections = [section("browse"), section("stations")];
    expect(orderHomeSections(sections, [], []).map((entry) => entry.kind)).toEqual(["browse", "stations"]);
  });
});

describe("moveHomeSection", () => {
  it("moves a section down", () => {
    expect(moveHomeSection(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves a section up", () => {
    expect(moveHomeSection(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("leaves the order alone when the place is wrong", () => {
    expect(moveHomeSection(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("toggleHiddenSection", () => {
  it("hides a section that is showing", () => {
    expect(toggleHiddenSection([], "browse")).toEqual(["browse"]);
  });

  it("shows a section that is hidden", () => {
    expect(toggleHiddenSection(["browse"], "browse")).toEqual([]);
  });
});

describe("HOME_SECTION_KEYS", () => {
  it("covers every section the feed can build", () => {
    expect(HOME_SECTION_KEYS).toContain("jump-back-in");
    expect(HOME_SECTION_KEYS).toContain("stations");
    expect(new Set(HOME_SECTION_KEYS).size).toBe(HOME_SECTION_KEYS.length);
  });
});
