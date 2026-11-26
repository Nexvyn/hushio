import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { Sidebar } from "./Sidebar";
import { DEFAULT_PINS, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

const initialLibrary = useLibrary.getState();
const initialNavigation = useNavigation.getState();

const playlist = (id: string, pinned = false): Playlist => ({
  id,
  name: `Mix ${id}`,
  folderId: null,
  pinned,
  tracks: [],
});

function rowKeys(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-row-key]")).map((row) => row.dataset.rowKey ?? "");
}

beforeEach(() => {
  useLibrary.setState({ ...initialLibrary, pinnedSingles: DEFAULT_PINS, libraryOrder: undefined, playlists: [] }, true);
  useNavigation.setState(initialNavigation, true);
  useSettings.setState({ sidebarSort: "recents" });
});

afterEach(cleanup);

describe("Your Library sidebar", () => {
  it("lists pinned rows first and the rest in their default order", () => {
    useLibrary.setState({ playlists: [playlist("a"), playlist("b", true)] });
    const { container } = render(<Sidebar />);

    expect(rowKeys(container)).toEqual([
      "single:liked",
      "playlist:b",
      "single:downloads",
      "single:local",
      "playlist:a",
      "single:spotify",
    ]);
  });

  it("keeps Import as the last row and shows no discover links above the library", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);

    expect(rowKeys(container).at(-1)).toBe("single:spotify");
    for (const name of ["Charts", "New releases", "Daylist", "Replay"]) {
      expect(screen.queryByRole("button", { name: new RegExp(name) })).toBeNull();
    }
    expect(screen.queryByRole("navigation", { name: "Browse" })).toBeNull();
  });

  it("gives every row a 52px height and a 44px art box, with 4px between rows", () => {
    useLibrary.setState({ playlists: [playlist("a", true)] });
    const { container } = render(<Sidebar />);

    const create = screen.getByRole("button", { name: "Create" });
    expect(create.className).toContain("h-8 w-8");
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-row-key]"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.className).toContain("h-[52px]");
      expect(row.firstElementChild?.className).toContain("h-11 w-11 shrink-0");
      expect(row.querySelector("span.flex-col")?.className).toContain("justify-center");
    }
    expect(container.querySelector("[aria-label='Library'] ul")?.className).toContain("space-y-1");
  });

  it("shows a pin mark only on pinned rows", () => {
    useLibrary.setState({ playlists: [playlist("a", true), playlist("b")] });
    render(<Sidebar />);

    expect(screen.getByRole("button", { name: /Mix a/ }).querySelector("span[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Mix b/ }).querySelector("span[aria-hidden='true']")).toBeNull();
  });

  it("moves an unpinned row down with Alt+ArrowDown, keeps focus on it, and saves the order", async () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);
    await chooseCustomOrder();

    const downloads = screen.getByRole("button", { name: /Downloads/ });
    downloads.focus();
    fireEvent.keyDown(downloads, { key: "ArrowDown", altKey: true });

    expect(useLibrary.getState().libraryOrder).toEqual(["single:local", "single:downloads", "playlist:a"]);
    expect(rowKeys(container).slice(1, 4)).toEqual(["single:local", "single:downloads", "playlist:a"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Downloads/ }));
  });

  it("does not move rows with Alt+Arrow or drag outside Custom order", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    render(<Sidebar />);

    fireEvent.keyDown(screen.getByRole("button", { name: /Downloads/ }), { key: "ArrowDown", altKey: true });
    pointer(screen.getByRole("button", { name: /Downloads/ }), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    pointer(window, "pointerup", { x: 0, y: 95 });

    expect(useLibrary.getState().libraryOrder).toBeUndefined();
  });

  it("moves an unpinned row up with Alt+ArrowUp", async () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);
    await chooseCustomOrder();

    fireEvent.keyDown(screen.getByRole("button", { name: /Mix a/ }), { key: "ArrowUp", altKey: true });

    expect(rowKeys(container).slice(1, 4)).toEqual(["single:downloads", "playlist:a", "single:local"]);
  });

  it("does not move a pinned row and ignores Arrow keys without Alt", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    render(<Sidebar />);

    const liked = screen.getByRole("button", { name: /Liked Songs/ });
    fireEvent.keyDown(liked, { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(screen.getByRole("button", { name: /Downloads/ }), { key: "ArrowDown" });

    expect(useLibrary.getState().libraryOrder).toBeUndefined();
  });

  it("opens a playlist and marks it as the current page", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    render(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: /Mix a/ }));
    expect(useNavigation.getState().view).toEqual({ name: "playlist", param: "a" });
    expect(screen.getByRole("button", { name: /Mix a/ }).getAttribute("aria-current")).toBe("page");
  });

  it("shows the live liked count and opens Liked Songs", () => {
    useLibrary.setState({ liked: [{ id: "s1", title: "S", artist: "A", thumb: null, album: null, duration: 1, explicit: false }] });
    render(<Sidebar />);

    expect(screen.getByText("1 song")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Liked Songs/ }));
    expect(useNavigation.getState().view).toEqual({ name: "library", param: "liked" });
  });

  it("shows a short Downloads subtitle that fits the sidebar", () => {
    useLibrary.setState({
      downloads: {
        s1: { status: "done", path: "a.m4a" } as never,
      },
    });
    render(<Sidebar />);

    expect(screen.getByText("1 song")).toBeTruthy();
    expect(screen.queryByText(/Downloaded/)).toBeNull();
  });
});

async function chooseCustomOrder() {
  fireEvent.click(screen.getByRole("button", { name: /Sort library/ }));
  await act(async () => useUI.getState().contextMenu?.items.find((item) => item.label === "Custom order")?.onSelect?.());
}

function pointer(target: Element | Window, type: string, at: { x: number; y: number }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
}

describe("Your Library drag and drop", () => {
  beforeEach(() => {
    useLibrary.setState({ ...initialLibrary, pinnedSingles: DEFAULT_PINS, libraryOrder: undefined, playlists: [], folders: [] }, true);
    useUI.setState({ toasts: [] });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const index = Array.from(document.querySelectorAll("[data-row-key]")).indexOf(this);
      const top = index < 0 ? 0 : index * 60;
      return { top, bottom: top + 50, height: 50, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("reorders unpinned rows by dragging and saves the whole order", async () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    render(<Sidebar />);
    await chooseCustomOrder();

    const downloads = screen.getByRole("button", { name: /Downloads/ });
    pointer(downloads, "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    pointer(window, "pointerup", { x: 0, y: 95 });

    await waitFor(() =>
      expect(useLibrary.getState().libraryOrder).toEqual(["single:local", "single:downloads", "playlist:a"]),
    );
  });

  it("files a dragged playlist into a folder when it is dropped on the folder row", () => {
    useLibrary.setState({ playlists: [playlist("a")], folders: [{ id: "f1", name: "Road" }] });
    render(<Sidebar />);
    const folder = screen.getByRole("button", { name: /Road/ });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => folder });

    pointer(screen.getByRole("button", { name: /Mix a/ }), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    pointer(window, "pointerup", { x: 0, y: 95 });

    expect(useLibrary.getState().playlists[0].folderId).toBe("f1");
    expect(useLibrary.getState().libraryOrder).toBeUndefined();
    expect(useUI.getState().toasts.map((toast) => toast.message)).toEqual(['Moved “Mix a” into the folder']);
  });
});

describe("Your Library sidebar rail", () => {
  beforeEach(() => {
    useNavigation.setState(initialNavigation, true);
  });

  afterEach(cleanup);

  it("labels the icon-only rail buttons without any discover links", () => {
    render(<Sidebar mode="rail" />);

    expect(screen.getByRole("button", { name: "Your Library" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Liked Songs" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Charts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
  });
});

describe("Your Library sidebar header layout", () => {
  beforeEach(() => {
    useLibrary.setState({ ...initialLibrary, pinnedSingles: DEFAULT_PINS, libraryOrder: undefined, playlists: [], folders: [] }, true);
    useNavigation.setState(initialNavigation, true);
  });

  afterEach(cleanup);

  it("puts the title and create/collapse buttons on the first row", () => {
    render(<Sidebar />);

    const title = screen.getByRole("button", { name: "Your Library" });
    const row = title.parentElement as HTMLElement;
    expect(row.className).toContain("pl-4");
    expect(row.contains(screen.getByRole("button", { name: "Create" }))).toBe(true);
    expect(row.contains(screen.getByRole("button", { name: "Collapse your library" }))).toBe(true);
  });

  it("keeps the sort and view controls with the search button and no filter chips", () => {
    render(<Sidebar />);

    expect(screen.queryByRole("group", { name: "Filter library" })).toBeNull();
    const sort = screen.getByRole("button", { name: /Sort library/ });
    const controlRow = sort.parentElement?.parentElement as HTMLElement;
    expect(controlRow.contains(screen.getByRole("button", { name: "Search your library" }))).toBe(true);
    expect(controlRow.contains(screen.getByRole("button", { name: "Library view" }))).toBe(true);
  });

  it("shows the current sort as a text button labelled with that sort", () => {
    render(<Sidebar />);

    const sort = screen.getByRole("button", { name: "Sort library, Recents" });
    expect(sort.textContent).toBe("Recents");
  });

  it("fills the remaining height with the library list and keeps 8px under its last row", () => {
    render(<Sidebar />);

    const library = screen.getByRole("navigation", { name: "Library" });
    expect(library.className).toContain("min-h-0");
    expect(library.className).toContain("flex-1");
    expect(library.className).toContain("overflow-y-auto");
    expect(library.className).not.toContain("pb-2");
    expect(library.querySelector("ul")?.className).toContain("pb-2");
  });
});

describe("Your Library sidebar settings", () => {
  beforeEach(() => {
    useLibrary.setState({ ...initialLibrary, pinnedSingles: DEFAULT_PINS, libraryOrder: undefined, playlists: [] }, true);
    useNavigation.setState(initialNavigation, true);
  });

  afterEach(cleanup);

  it("has no Settings link in the full sidebar", () => {
    render(<Sidebar />);

    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("has no Settings icon in the icon rail", () => {
    render(<Sidebar mode="rail" />);

    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByTitle("Settings")).toBeNull();
  });
});

describe("Your Library sidebar panels", () => {
  beforeEach(() => {
    useLibrary.setState({ ...initialLibrary, pinnedSingles: DEFAULT_PINS, libraryOrder: undefined, playlists: [], folders: [] }, true);
  });

  it("shows an empty playlist as Playlist without a song count", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    render(<Sidebar />);

    expect(screen.getAllByText("Playlist").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Playlist · 0 songs/)).toBeNull();
  });

  it("lists every library row without filter chips", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);

    expect(rowKeys(container)).toContain("playlist:a");
    expect(screen.queryByRole("button", { name: "Artists" })).toBeNull();
  });
});

describe("Your Library sidebar minimal layout", () => {
  beforeEach(() => {
    useLibrary.setState({ ...initialLibrary, pinnedSingles: DEFAULT_PINS, libraryOrder: undefined, playlists: [], folders: [] }, true);
    useNavigation.setState(initialNavigation, true);
    useUI.setState({ contextMenu: null });
  });

  afterEach(cleanup);

  it("has no Home or Search rows and no Sorted by line in the sidebar", () => {
    render(<Sidebar />);

    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    expect(screen.queryByText("Sorted by")).toBeNull();
    expect(screen.queryByPlaceholderText("Search in Your Library")).toBeNull();
  });

  it("shows the search icon and expands it into a field that Escape collapses", () => {
    render(<Sidebar />);

    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search your library" }));
    const field = screen.getByRole("searchbox", { name: "Search your library" });

    fireEvent.change(field, { target: { value: "Mix" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("keeps a typed search open on blur and closes an empty one", () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: "Search your library" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Mix" } });
    fireEvent.blur(screen.getByRole("searchbox"));
    expect(screen.getByRole("searchbox")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.blur(screen.getByRole("searchbox"));
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("lists the sorts in the sort menu with the current one checked", () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: "Sort library, Recents" }));
    const items = useUI.getState().contextMenu?.items ?? [];
    expect(items.map((item) => item.label)).toEqual([
      "Sort by",
      "Recents",
      "Recently added",
      "Alphabetical",
      "Creator",
      "Custom order",
    ]);
    expect(items.find((item) => item.label === "Recents")?.checked).toBe(true);
  });

  it("renders the Your Library title and the collapse control without the old icon", () => {
    render(<Sidebar />);

    expect(screen.getByRole("button", { name: "Your Library" }).textContent).toBe("Your Library");
    expect(screen.getByRole("button", { name: "Collapse your library" }).className).toContain("h-8 w-8");
  });
});

describe("Your Library sidebar views", () => {
  beforeEach(() => {
    useLibrary.setState({ ...initialLibrary, pinnedSingles: DEFAULT_PINS, libraryOrder: undefined, playlists: [], folders: [], savedAlbums: [], downloads: {} }, true);
    useSettings.setState({ sidebarLayout: "list" });
    useUI.setState({ contextMenu: null });
  });

  it("switches the library rows to a cover grid and back through the view menu", async () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);
    const list = () => container.querySelector("nav[aria-label='Library'] ul") as HTMLElement;

    expect(list().className).not.toContain("grid-cols");
    fireEvent.click(screen.getByRole("button", { name: "Library view" }));
    const grid = useUI.getState().contextMenu?.items.find((item) => item.label === "Grid");
    act(() => grid?.onSelect?.());
    expect(useSettings.getState().sidebarLayout).toBe("grid");
    await waitFor(() => expect(list().className).toContain("grid-cols"));
  });
});
