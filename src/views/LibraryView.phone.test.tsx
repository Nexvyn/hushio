import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ContextMenu } from "../components/ContextMenu";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));
vi.mock("../lib/audio", () => ({ audio, playStream, play, pause, seekTo, setVolume, setMuted }));
vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { LibraryView } from "./LibraryView";
import { type LibraryTrack, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const song = (i: number): LibraryTrack => ({
  id: `s${i}`,
  title: `Song ${i}`,
  artist: "Artist",
  thumb: null,
  album: null,
  duration: 200,
  explicit: false,
});

const initialLibrary = useLibrary.getState();
const initialNavigation = useNavigation.getState();
const initialUI = useUI.getState();

beforeEach(() => {
  useLibrary.setState(initialLibrary, true);
  useNavigation.setState(initialNavigation, true);
  useUI.setState({ ...initialUI, dialog: null }, true);
});

afterEach(cleanup);

describe("Library on phone", () => {
  it("shows a Library title with Create and the profile button, and no stats line", () => {
    render(<LibraryView />);
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Profile and settings" })).toBeTruthy();
    expect(screen.queryByText(/playlists · .* folders/)).toBeNull();
  });

  it("lists the collection rows without the Collections heading or a Playlists nav row", () => {
    render(<LibraryView />);
    expect(screen.queryByRole("region", { name: "Collections" })).toBeNull();
    for (const name of ["Liked Songs", "Downloads", "Local music"]) {
      expect(screen.getByText(name, { selector: "span.truncate" }).closest("button")).toBeTruthy();
    }
    expect(screen.queryAllByRole("button", { name: "Playlists" })).toHaveLength(0);
  });

  it("uses a compact flat row with a neutral 48px Liked Songs glyph", () => {
    render(<LibraryView />);
    const liked = screen.getByRole("button", { name: "Liked Songs" });
    expect(liked.className).toContain("h-16");
    expect(liked.querySelector("span.bg-elevated")).toBeNull();
    expect(liked.querySelector("span.bg-accent")).toBeNull();
    expect(liked.querySelector("svg")?.getAttribute("width")).toBe("24");
  });

  it("keeps category glyphs neutral and the phone library in flat lists", () => {
    render(<LibraryView />);
    const rows = screen.getAllByRole("button").filter((button) => button.querySelector("svg"));
    expect(rows.some((row) => row.querySelector("span.bg-accent, span.bg-elevated"))).toBe(false);
    expect(document.querySelector("ul.grid-cols-2")).toBeNull();
  });

  it("opens the pinned collection menu on long press and updates its pin state", async () => {
    vi.useFakeTimers();
    try {
      useLibrary.setState({ pinnedSingles: { ...initialLibrary.pinnedSingles, liked: false } });
      render(<><LibraryView /><ContextMenu /></>);
      const liked = screen.getByRole("button", { name: "Liked Songs" });
      fireEvent.pointerDown(liked, { pointerId: 1, clientX: 20, clientY: 20 });
      await vi.advanceTimersByTimeAsync(300);
      expect(screen.getByRole("menuitem", { name: "Pin to top" })).toBeTruthy();
      fireEvent.click(screen.getByRole("menuitem", { name: "Pin to top" }));
      expect(useLibrary.getState().pinnedSingles.liked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the liked song count and the On this device subtitle", () => {
    useLibrary.setState({ liked: [song(1), song(2)] });
    render(<LibraryView />);
    const liked = within(screen.getByRole("button", { name: "Liked Songs" }));
    expect(liked.getByText("2 songs")).toBeTruthy();
    expect(screen.getByText(/songs on this device/)).toBeTruthy();
  });

  it("shows a plain zero count when nothing is liked yet", () => {
    useLibrary.setState({ liked: [], pinnedSingles: { ...initialLibrary.pinnedSingles, liked: false } });
    render(<LibraryView />);
    expect(within(screen.getByRole("button", { name: "Liked Songs" })).getByText("0 songs")).toBeTruthy();
  });

  it("starts a new playlist from the empty Playlists row", () => {
    render(<LibraryView />);
    expect(screen.getByText("Start one with songs you like")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New playlist" }));
    expect(useUI.getState().dialog?.title).toBe("New playlist");
  });

  it("opens Import from its Library row", () => {
    render(<LibraryView />);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(useNavigation.getState().view).toEqual({ name: "import" });
  });

  it("opens Downloads from its row", () => {
    render(<LibraryView />);
    fireEvent.click(screen.getByText("Downloads", { selector: "span.truncate" }).closest("button") as HTMLElement);
    expect(useNavigation.getState().view).toEqual({ name: "downloads" });
  });

  it("shows playlists under a Playlists heading with the song count", () => {
    useLibrary.setState({
      playlists: [
        { id: "a", name: "Road", folderId: null, pinned: false, tracks: [] },
      ],
      folders: [],
    });
    render(<LibraryView />);
    const section = within(screen.getByRole("region", { name: "Playlists" }));
    expect(section.getByRole("heading", { name: "Playlists" })).toBeTruthy();
    expect(section.getByText("Road")).toBeTruthy();
    expect(section.getByText("Playlist · 0 songs")).toBeTruthy();
  });

  it("keeps pinned playlists flat and shows their song count", () => {
    useLibrary.setState({
      playlists: [{ id: "a", name: "Road", folderId: null, pinned: true, tracks: [song(1), song(2)] }],
      folders: [],
    });
    render(<LibraryView />);
    const tile = screen.getByRole("button", { name: "Road" });
    expect(within(tile).queryByText("Pinned,")).toBeNull();
    expect(within(tile).getByText("Playlist · 2 songs")).toBeTruthy();
    expect(tile.querySelector("svg")).toBeTruthy();
    const section = within(screen.getByRole("region", { name: "Playlists" }));
    expect(section.queryByText("Start one with songs you like")).toBeTruthy();
  });

  it("shows New playlist as the last flat row", () => {
    useLibrary.setState({
      playlists: [{ id: "a", name: "Road", folderId: null, pinned: false, tracks: [] }],
      folders: [],
    });
    render(<LibraryView />);
    const section = screen.getByRole("region", { name: "Playlists" });
    const list = section.querySelector("ul");
    const newPlaylist = within(section).getByRole("button", { name: "New playlist" });
    expect(list?.className).not.toContain("grid-cols-2");
    expect(list?.lastElementChild?.contains(newPlaylist)).toBe(true);
  });

});
