import { ContextMenu } from "../components/ContextMenu";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play,
  pause,
  seekTo,
  setVolume,
  setMuted,
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PlaylistView } from "./PlaylistView";
import { Toasts } from "../components/Toasts";
import { deletionKey } from "../lib/deletionSync";
import { fmtTotal } from "../lib/format";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

function pointer(target: Element | Window, type: string, at: { x: number; y: number; pointerType?: string }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 });
  Object.defineProperty(event, "pointerType", { value: at.pointerType ?? "mouse" });
  target.dispatchEvent(event);
}

const song = (i: number, duration: number, artist = "Artist A"): LibraryTrack => ({
  id: `s${i}`,
  title: `Song ${i}`,
  artist,
  thumb: null,
  album: null,
  duration,
  explicit: false,
});

const playlist = (tracks: LibraryTrack[]): Playlist => ({
  id: "p1",
  name: "Road trip",
  folderId: null,
  pinned: false,
  tracks,
});

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialNavigation = useNavigation.getState();
const initialUI = useUI.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useNavigation.setState({ ...initialNavigation, view: { name: "playlist", param: "p1" } }, true);
  useUI.setState({ ...initialUI, dialog: null, toasts: [] }, true);
});

afterEach(cleanup);

describe("Playlist page for a missing playlist", () => {
  it("explains that the playlist no longer exists", () => {
    useNavigation.setState({ view: { name: "playlist", param: "gone" } });
    render(<><PlaylistView /><ContextMenu /></>);

    expect(screen.getByRole("heading", { name: "This playlist no longer exists" })).toBeTruthy();
  });
});

describe("Playlist page when empty", () => {
  beforeEach(() => {
    useLibrary.setState({ playlists: [playlist([])] });
  });

  it("offers search and Explore from the empty state", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    expect(screen.getByRole("heading", { name: "Let's find something for your playlist" })).toBeTruthy();
    expect(screen.getByText("No songs yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Browse Explore" }));
    expect(useNavigation.getState().view).toEqual({ name: "explore" });
  });

  it("disables Shuffle and does nothing when Play is pressed", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    expect((screen.getByRole("button", { name: "Shuffle" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Play Road trip" }));
    expect(usePlayer.getState().queue).toEqual([]);
  });
});

describe("Playlist page with songs", () => {
  beforeEach(() => {
    useLibrary.setState({
      playlists: [playlist([song(1, 600, "Artist A"), song(2, 1200, "Artist B"), song(3, 0, "Artist B")])],
    });
  });

  it("shows the count, length and top artist", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    expect(screen.getByRole("heading", { name: "Road trip" })).toBeTruthy();
    expect(screen.getByText(`3 songs · ${fmtTotal(1800)} · Top artist:`, { exact: false })).toBeTruthy();
    expect(screen.getByText("Artist B", { selector: "span.font-semibold" })).toBeTruthy();
  });

  it("starts playback from a clicked row and keeps the playlist as the source", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByText("Song 2"));
    expect(usePlayer.getState().playingFrom).toBe("p1");
    expect(usePlayer.getState().index).toBe(1);
  });

  it("plays the whole playlist from the play button", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "Play Road trip" }));
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("moves a song down with the row menu and saves the new order", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 1" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));

    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s2", "s1", "s3"]);
  });

  it("disables Move up on the first song", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 1" }));
    expect((screen.getByRole("menuitem", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("removes a song from the playlist and records a tombstone", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 2" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from this playlist" }));

    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s1", "s3"]);
    expect(useLibrary.getState().deletionSync?.deletes[deletionKey("tracks", "s2", "p1")]).toBeGreaterThan(0);
  });

  it("moves a song to the top and to the bottom from the row menu", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 2" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to top" }));
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s2", "s1", "s3"]);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 2" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to bottom" }));
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s1", "s3", "s2"]);
  });

  it("disables Move to top on the first song and Move to bottom on the last", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 1" }));
    expect((screen.getByRole("menuitem", { name: "Move to top" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("menuitem", { name: "Move to bottom" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("restores a removed song at its place when Undo is pressed", () => {
    render(
      <>
        <PlaylistView />
        <Toasts />
        <ContextMenu />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 2" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from this playlist" }));
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s1", "s3"]);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("moves a song with Alt+ArrowDown and keeps focus on its row", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    const first = screen.getByText("Song 1").closest("li") as HTMLElement;
    const button = first.querySelector("button") as HTMLButtonElement;
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowDown", altKey: true });

    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s2", "s1", "s3"]);
    const moved = screen.getByText("Song 1").closest("li") as HTMLElement;
    expect(document.activeElement).toBe(moved.querySelector("button"));
  });

  it("drops a dragged song onto Liked Songs and leaves the playlist order alone", () => {
    const liked = document.createElement("button");
    liked.dataset.dropTarget = "liked";
    document.body.appendChild(liked);
    const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => liked });
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const index = Array.from(document.querySelectorAll("[data-row-key]")).indexOf(this);
        const top = index * 60;
        return { top, bottom: top + 50, height: 50, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
      });

    render(<><PlaylistView /><ContextMenu /></>);
    const row = screen.getByText("Song 2").closest("li") as HTMLElement;
    pointer(row, "pointerdown", { x: 0, y: 70 });
    pointer(window, "pointermove", { x: 0, y: 100 });
    pointer(window, "pointerup", { x: 0, y: 100 });

    expect(useLibrary.getState().liked.map((item) => item.id)).toEqual(["s2"]);
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s1", "s2", "s3"]);
    expect(useUI.getState().toasts.map((toast) => toast.message)).toEqual(["Added “Song 2” to Liked Songs"]);

    rect.mockRestore();
    liked.remove();
    if (original) Object.defineProperty(document, "elementFromPoint", original);
    else Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("adds every song to the queue from the header menu", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add all to queue" }));

    expect(usePlayer.getState().queue).toHaveLength(3);
    expect(useUI.getState().toasts.map((toast) => toast.message)).toContain("Playlist added to queue");
  });

  it("opens the rename dialog with the current name", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

    expect(useUI.getState().dialog?.title).toBe("Rename playlist");
    expect(useUI.getState().dialog?.initialValue).toBe("Road trip");
  });

  it("asks before deleting and then returns to Your Library", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete playlist" }));
    const request = useUI.getState().dialog;
    expect(request?.title).toBe('Delete "Road trip"?');
    expect(request?.danger).toBe(true);

    request?.onConfirm("");
    expect(useLibrary.getState().playlists).toEqual([]);
    expect(useNavigation.getState().view).toEqual({ name: "library" });
  });

  it("lists the songs in order", () => {
    render(<><PlaylistView /><ContextMenu /></>);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Song 1")).toBeTruthy();
  });
});
