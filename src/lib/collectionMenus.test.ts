import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  artistRowMenuItems,
  createMenuItems,
  folderMenuItems,
  panelMenuItems,
  pinnedSingleMenuItems,
  playlistHeaderItems,
  playlistMenuItems,
} from "./collectionActions";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { type MenuItem, useUI } from "../stores/ui";

vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const initialLibrary = useLibrary.getState();
const initialUI = useUI.getState();

const track: LibraryTrack = { id: "t1", title: "One", artist: "A", thumb: null, album: null, duration: 100, explicit: false };

function playlist(overrides: Partial<Playlist> = {}): Playlist {
  return { id: "p1", name: "Road trip", folderId: null, pinned: false, tracks: [track], ...overrides };
}

function labelsOf(items: MenuItem[]): string[] {
  return items.filter((item) => !item.subject).map((item) => item.label);
}

function itemNamed(items: MenuItem[], label: string): MenuItem {
  const found = items.find((item) => item.label === label);
  if (!found) throw new Error(`no menu item named ${label}`);
  return found;
}

beforeEach(() => {
  useLibrary.setState(initialLibrary, true);
  useUI.setState({ ...initialUI, dialog: null, toasts: [], pendingToasts: [] }, true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("create menu (PRD 32.10.1 O)", () => {
  it("offers Playlist, Folder and the two import rows, which wait for the import commit", () => {
    const items = createMenuItems();

    expect(labelsOf(items)).toEqual([
      "Playlist",
      "Folder",
      "Import a playlist link or song list",
      "Import a file",
    ]);
    expect(items[0].note).toBe("Create a playlist with songs");
    expect(items[3].note).toBe(".csv, .txt, .m3u8 or Hushio .json");
    expect(items[2].disabled).toBe(true);
    expect(items[3].disabled).toBe(true);
  });

  it("opens the New playlist dialog from Playlist with a numbered suggestion", () => {
    itemNamed(createMenuItems(), "Playlist").onSelect?.();

    expect(useUI.getState().dialog).toMatchObject({ title: "New playlist", initialValue: "My Playlist #1" });
  });
});

describe("empty sidebar area menu (PRD 32.10.1 N)", () => {
  it("heads the menu with the panel name and offers the two create actions", () => {
    const items = panelMenuItems();

    expect(items[0]).toMatchObject({ label: "Your Library", header: true });
    expect(labelsOf(items)).toEqual(["Your Library", "Create playlist", "Create folder"]);
    itemNamed(items, "Create folder").onSelect?.();
    expect(useUI.getState().dialog?.title).toBe("New folder");
  });
});

describe("playlist header menu (PRD 32.10.1 C)", () => {
  it("offers Rename and a danger Delete playlist, with a subject showing the song count", () => {
    const items = playlistHeaderItems(playlist({ tracks: [track, { ...track, id: "t2" }] }));

    expect(labelsOf(items)).toEqual(["Rename", "Delete playlist"]);
    expect(itemNamed(items, "Delete playlist").danger).toBe(true);
    expect(items.find((item) => item.subject)?.subject).toMatchObject({
      title: "Road trip",
      subtitle: "Playlist · 2 songs",
    });
  });

  it("asks before deleting and keeps the songs in the confirmation text", () => {
    useLibrary.setState({ playlists: [playlist()] });

    itemNamed(playlistHeaderItems(playlist()), "Delete playlist").onSelect?.();

    expect(useUI.getState().dialog).toMatchObject({ title: 'Delete "Road trip"?', danger: true });
  });
});

describe("sidebar playlist menu (PRD 32.10.1 E and F)", () => {
  it("pins or unpins, then offers Rename and Delete playlist with no folder", () => {
    const items = playlistMenuItems(playlist());

    expect(items[0].label).toBe("Pin playlist");
    expect(labelsOf(items)).toEqual(["Pin playlist", "Rename", "Delete playlist"]);
    expect(labelsOf(playlistMenuItems(playlist({ pinned: true })))[0]).toBe("Unpin playlist");
  });

  it("lists the folders with the one the playlist is in ticked", () => {
    useLibrary.setState({
      folders: [
        { id: "f1", name: "Work" },
        { id: "f2", name: "Chill" },
      ],
    });

    const items = playlistMenuItems(playlist({ folderId: null }));
    expect(labelsOf(items)).toEqual(["Pin playlist", "Rename", "Delete playlist", "Folder", "Work", "Chill"]);
    expect(itemNamed(items, "Work").checked).toBe(false);
  });

  it("moves the playlist into a folder when a folder row is picked", () => {
    useLibrary.setState({ playlists: [playlist()], folders: [{ id: "f1", name: "Work" }] });

    itemNamed(playlistMenuItems(playlist()), "Work").onSelect?.();

    expect(useLibrary.getState().playlists[0].folderId).toBe("f1");
  });

  it("inside a folder offers Remove from folder as a danger row, then Undo puts it back", () => {
    useLibrary.setState({
      playlists: [playlist({ folderId: "f1" })],
      folders: [{ id: "f1", name: "Work" }],
    });
    const inside = useLibrary.getState().playlists[0];

    const items = playlistMenuItems(inside);
    expect(labelsOf(items)).toEqual([
      "Pin playlist",
      "Rename",
      "Remove from folder",
      "Folder",
      "Work",
      "Delete playlist",
    ]);
    expect(itemNamed(items, "Remove from folder").danger).toBe(true);
    expect(itemNamed(items, "Work").checked).toBe(true);
    expect(itemNamed(items, "Delete playlist").danger).toBeUndefined();

    itemNamed(items, "Remove from folder").onSelect?.();
    expect(useLibrary.getState().playlists[0].folderId).toBeNull();

    useUI.getState().toasts.at(-1)?.action?.run();
    expect(useLibrary.getState().playlists[0].folderId).toBe("f1");
  });
});

describe("folder menu (PRD 32.10.1 K)", () => {
  it("renames with a dialog and deletes only after confirmation", () => {
    useLibrary.setState({ folders: [{ id: "f1", name: "Work" }], playlists: [playlist({ folderId: "f1" })] });

    expect(labelsOf(folderMenuItems("f1"))).toEqual(["Rename folder", "Delete folder"]);
    expect(itemNamed(folderMenuItems("f1"), "Delete folder").danger).toBe(true);

    itemNamed(folderMenuItems("f1"), "Delete folder").onSelect?.();
    expect(useLibrary.getState().folders).toHaveLength(1);
    expect(useUI.getState().dialog).toMatchObject({ title: "Delete folder?", danger: true });

    useUI.getState().dialog?.onConfirm("");
    expect(useLibrary.getState().folders).toEqual([]);
  });
});

describe("shortcut row menu (PRD 32.10.1 L)", () => {
  it("toggles the pin for a shortcut row", () => {
    expect(labelsOf(pinnedSingleMenuItems("replay", false))).toEqual(["Pin to top"]);
    expect(labelsOf(pinnedSingleMenuItems("liked", true))).toEqual(["Unpin"]);

    itemNamed(pinnedSingleMenuItems("replay", false), "Pin to top").onSelect?.();

    expect(useLibrary.getState().pinnedSingles.replay).toBe(false);
  });
});

describe("followed artist menu (PRD 32.10.1 M)", () => {
  beforeEach(() => {
    useLibrary.setState({ followedArtists: [{ id: "UC1", name: "Band", followedAt: 1 }] });
  });

  it("asks for confirmation and then removes the artist with a toast", () => {
    const remove = itemNamed(artistRowMenuItems({ id: "UC1", name: "Band" }), "Remove from your library");
    expect(remove.danger).toBe(true);

    remove.onSelect?.();
    expect(useUI.getState().dialog).toMatchObject({ title: "Remove “Band”?", danger: true });
    expect(useLibrary.getState().followedArtists).toHaveLength(1);

    useUI.getState().dialog?.onConfirm("");
    expect(useLibrary.getState().followedArtists).toEqual([]);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("Removed “Band” from your library");
  });
});
