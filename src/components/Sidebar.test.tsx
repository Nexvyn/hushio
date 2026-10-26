import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
      "single:spotify",
      "single:replay",
      "playlist:b",
      "single:downloads",
      "single:local",
      "playlist:a",
    ]);
  });

  it("moves an unpinned row down with Alt+ArrowDown, keeps focus on it, and saves the order", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);

    const downloads = screen.getByRole("button", { name: /Downloads/ });
    downloads.focus();
    fireEvent.keyDown(downloads, { key: "ArrowDown", altKey: true });

    expect(useLibrary.getState().libraryOrder).toEqual(["single:local", "single:downloads", "playlist:a"]);
    expect(rowKeys(container).slice(3)).toEqual(["single:local", "single:downloads", "playlist:a"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Downloads/ }));
  });

  it("moves an unpinned row up with Alt+ArrowUp", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    const { container } = render(<Sidebar />);

    fireEvent.keyDown(screen.getByRole("button", { name: /Mix a/ }), { key: "ArrowUp", altKey: true });

    expect(rowKeys(container).slice(3)).toEqual(["single:downloads", "playlist:a", "single:local"]);
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

    expect(screen.getByText("Playlist · 1 track")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Liked Songs/ }));
    expect(useNavigation.getState().view).toEqual({ name: "library", param: "liked" });
  });
});
