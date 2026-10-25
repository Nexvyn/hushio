import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import {
  cleanSubtitle,
  RECENT_ITEM_LIMIT,
  RECENT_SEARCH_LIMIT,
  useRecentItems,
  useRecents,
  type RecentItem,
} from "./recents";

const initialSearches = useRecents.getState();
const initialItems = useRecentItems.getState();

function item(id: string, kind: RecentItem["kind"] = "song", subtitle = "Artist"): RecentItem {
  return { kind, id, title: `Title ${id}`, subtitle, thumb: null };
}

beforeEach(() => {
  useRecents.setState(initialSearches, true);
  useRecentItems.setState(initialItems, true);
});

describe("recent searches", () => {
  it("puts the newest query first and moves a repeat to the top without case", () => {
    const { pushSearch } = useRecents.getState();
    pushSearch("daft punk");
    pushSearch("  Radiohead ");
    pushSearch("DAFT PUNK");

    expect(useRecents.getState().searches).toEqual(["DAFT PUNK", "Radiohead"]);
  });

  it("ignores blank queries", () => {
    useRecents.getState().pushSearch("   ");
    expect(useRecents.getState().searches).toEqual([]);
  });

  it("keeps only the latest queries", () => {
    const { pushSearch } = useRecents.getState();
    for (let index = 0; index < RECENT_SEARCH_LIMIT + 5; index++) pushSearch(`query ${index}`);

    const searches = useRecents.getState().searches;
    expect(searches).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(searches[0]).toBe(`query ${RECENT_SEARCH_LIMIT + 4}`);
  });

  it("removes one query and clears all", () => {
    useRecents.setState({ searches: ["a", "b", "c"] });

    useRecents.getState().removeSearch("b");
    expect(useRecents.getState().searches).toEqual(["a", "c"]);

    useRecents.getState().clearSearches();
    expect(useRecents.getState().searches).toEqual([]);
  });
});

describe("recently opened items", () => {
  it("adds items newest first and moves a reopened item to the top", () => {
    const { add } = useRecentItems.getState();
    add(item("1"));
    add(item("2", "artist"));
    add(item("1"));

    expect(useRecentItems.getState().items.map((entry) => entry.id)).toEqual(["1", "2"]);
  });

  it("treats the same id under a different kind as a different item", () => {
    const { add } = useRecentItems.getState();
    add(item("x", "album"));
    add(item("x", "playlist"));

    expect(useRecentItems.getState().items.map((entry) => entry.kind)).toEqual(["playlist", "album"]);
  });

  it("strips a leading type word from the subtitle", () => {
    useRecentItems.getState().add(item("9", "album", "Album • Dua Lipa"));
    expect(useRecentItems.getState().items[0].subtitle).toBe("Dua Lipa");
  });

  it("caps the list and removes or clears single entries", () => {
    const { add } = useRecentItems.getState();
    for (let index = 0; index < RECENT_ITEM_LIMIT + 3; index++) add(item(`${index}`));
    expect(useRecentItems.getState().items).toHaveLength(RECENT_ITEM_LIMIT);

    useRecentItems.getState().remove("song", `${RECENT_ITEM_LIMIT + 2}`);
    expect(useRecentItems.getState().items.some((entry) => entry.id === `${RECENT_ITEM_LIMIT + 2}`)).toBe(false);

    useRecentItems.getState().clear();
    expect(useRecentItems.getState().items).toEqual([]);
  });
});

describe("cleanSubtitle", () => {
  it.each([
    ["Artist • Dua Lipa", "Dua Lipa"],
    ["single •  Dua Lipa", "Dua Lipa"],
    ["Song • Dua Lipa", "Dua Lipa"],
    ["Dua Lipa • 2020", "Dua Lipa • 2020"],
  ])("cleans %s", (input, expected) => {
    expect(cleanSubtitle(input)).toBe(expected);
  });
});
