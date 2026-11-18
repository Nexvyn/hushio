import { beforeEach, describe, expect, it } from "vitest";
import { useUI } from "./ui";
import { useNavigation } from "./navigation";

const initial = useNavigation.getState();

beforeEach(() => {
  useNavigation.setState(initial, true);
});

describe("navigation history", () => {
  it("keeps at most 40 back entries", () => {
    for (let i = 0; i < 45; i++) {
      useNavigation.getState().navigate({ name: "album", param: String(i) });
    }
    expect(useNavigation.getState().navPast).toHaveLength(40);
  });

  it("ignores a navigation to the same view", () => {
    useNavigation.getState().navigate({ name: "charts" });
    useNavigation.getState().navigate({ name: "charts" });
    expect(useNavigation.getState().navPast).toHaveLength(1);
  });


  it("goes back and forward", () => {
    useNavigation.getState().navigate({ name: "charts" });
    useNavigation.getState().navigate({ name: "library" });

    useNavigation.getState().goBack();
    expect(useNavigation.getState().view).toEqual({ name: "charts" });

    useNavigation.getState().goForward();
    expect(useNavigation.getState().view).toEqual({ name: "library" });
  });
});

it("restores submitted queries and their filters with Back and Forward", () => {
  function submit(query: string) {
    useNavigation.getState().submitSearch(query);
    useUI.getState().setSearchQuery(query);
    useNavigation.getState().navigate({ name: "search" });
  }
  useUI.setState({ searchQuery: "", searchFilter: "songs" });
  submit("Dua Lipa");
  useUI.getState().setSearchQuery("Arijit");
  submit("Arijit");
  useUI.getState().setSearchFilter("albums");
  useNavigation.getState().navigate({ name: "home" });
  useNavigation.getState().goBack();
  expect(useUI.getState()).toMatchObject({ searchQuery: "Arijit", searchFilter: "albums" });
  useNavigation.getState().goBack();
  expect(useUI.getState()).toMatchObject({ searchQuery: "Dua Lipa", searchFilter: "songs" });
  useNavigation.getState().goForward();
  expect(useUI.getState()).toMatchObject({ searchQuery: "Arijit", searchFilter: "albums" });
});

it("restores live search text after opening another page", () => {
  useNavigation.setState({ view: { name: "search" }, committedSearch: { query: "old query", filter: "all" } });
  useUI.setState({ searchQuery: "typed query", searchFilter: "artists" });
  useNavigation.getState().navigate({ name: "artist", param: "UC1" });
  useUI.setState({ searchQuery: "another query", searchFilter: "all" });
  useNavigation.getState().goBack();
  expect(useUI.getState()).toMatchObject({ searchQuery: "typed query", searchFilter: "artists" });
});

describe("originating tab", () => {
  it("keeps the tab a detail view was opened from", () => {
    useNavigation.getState().navigate({ name: "search" });
    useNavigation.getState().navigate({ name: "album", param: "a1" });
    expect(useNavigation.getState().tab).toBe("search");
    useNavigation.getState().navigate({ name: "artist", param: "x1" });
    expect(useNavigation.getState().tab).toBe("search");
  });

  it("switches tab only when a tab root is opened", () => {
    useNavigation.getState().navigate({ name: "search" });
    useNavigation.getState().navigate({ name: "library", param: "liked" });
    expect(useNavigation.getState().tab).toBe("search");
    useNavigation.getState().navigate({ name: "library" });
    expect(useNavigation.getState().tab).toBe("library");
  });

  it("restores the tab of the entry Back returns to", () => {
    useNavigation.getState().navigate({ name: "search" });
    useNavigation.getState().navigate({ name: "album", param: "a1" });
    useNavigation.getState().navigate({ name: "library" });
    useNavigation.getState().goBack();
    expect(useNavigation.getState()).toMatchObject({ view: { name: "album" }, tab: "search" });
    useNavigation.getState().goForward();
    expect(useNavigation.getState().tab).toBe("library");
  });
});
