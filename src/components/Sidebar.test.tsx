import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

  it("has no Replay row and keeps Import as the last row", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);

    expect(rowKeys(container)).not.toContain("single:replay");
    expect(rowKeys(container).at(-1)).toBe("single:spotify");
    expect(screen.queryByRole("button", { name: /Replay/ })).toBeNull();
  });

  it("gives every row the same padding, 40px art box and pin column, and matches the header inset", () => {
    useLibrary.setState({ playlists: [playlist("a", true)] });
    const { container } = render(<Sidebar />);

    const header = container.querySelector("aside > div");
    const nav = container.querySelector("nav");
    expect(header?.className).toContain("h-12");
    expect(header?.className).toContain("px-5");
    expect(nav?.className).toContain("px-2");
    const create = screen.getByRole("button", { name: "Create" });
    expect(create.className).toContain("h-8 w-8");
    expect(header?.querySelector("button span")?.className).toContain("w-10");
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-row-key]"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.className).toContain("h-14 px-3");
      expect(row.firstElementChild?.className).toContain("h-10 w-10 shrink-0");
      expect(row.querySelector("span.flex-col")?.className).toContain("justify-center");
      expect(row.querySelector("span[aria-hidden='true']")?.className).toContain("h-8 w-8 shrink-0");
    }
    expect(container.querySelector("ul")?.className).toContain("space-y-1");
  });

  it("moves an unpinned row down with Alt+ArrowDown, keeps focus on it, and saves the order", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);

    const downloads = screen.getByRole("button", { name: /Downloads/ });
    downloads.focus();
    fireEvent.keyDown(downloads, { key: "ArrowDown", altKey: true });

    expect(useLibrary.getState().libraryOrder).toEqual(["single:local", "single:downloads", "playlist:a"]);
    expect(rowKeys(container).slice(1, 4)).toEqual(["single:local", "single:downloads", "playlist:a"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Downloads/ }));
  });

  it("moves an unpinned row up with Alt+ArrowUp", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);

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

    expect(screen.getByText("Playlist · 1 song")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Liked Songs/ }));
    expect(useNavigation.getState().view).toEqual({ name: "library", param: "liked" });
  });
});

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

describe("Your Library sidebar discover links", () => {
  beforeEach(() => {
    useNavigation.setState(initialNavigation, true);
  });

  afterEach(cleanup);

  it("opens Charts and New releases from the sidebar", () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: /Charts/ }));
    expect(useNavigation.getState().view).toEqual({ name: "charts" });

    fireEvent.click(screen.getByRole("button", { name: /New releases/ }));
    expect(useNavigation.getState().view).toEqual({ name: "newreleases" });
  });

  it("marks the open discover page as current", () => {
    useNavigation.setState({ view: { name: "charts" } });
    render(<Sidebar />);

    expect(screen.getByRole("button", { name: /Charts/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /New releases/ }).getAttribute("aria-current")).toBeNull();
  });

  it("labels the icon-only rail buttons", () => {
    render(<Sidebar mode="rail" />);

    expect(screen.getByRole("button", { name: "Charts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New releases" })).toBeTruthy();
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
