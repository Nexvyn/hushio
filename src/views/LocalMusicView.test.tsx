import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const player = vi.hoisted(() => ({
  playQueue: vi.fn(),
  shuffle: false,
  toggleShuffle: vi.fn(),
}));
const bridge = vi.hoisted(() => ({
  pickFolder: vi.fn(async () => null),
  localLibraryRemoveFolder: vi.fn(),
}));

vi.mock("../stores/player", () => ({ usePlayer: { getState: () => player } }));
vi.mock("../lib/bridge", () => ({
  platform: "windows",
  pickFolder: bridge.pickFolder,
  localLibraryRemoveFolder: bridge.localLibraryRemoveFolder,
  localLibraryGet: vi.fn(),
  localLibraryOpened: vi.fn(),
  localLibraryFolderStatuses: vi.fn(),
  localLibraryForgetOpened: vi.fn(),
  localLibraryScan: vi.fn(),
  localLibraryAddFolders: vi.fn(),
  localLibraryRenameFolder: vi.fn(),
  localLibraryOpenFiles: vi.fn(),
  scrobbleStatus: async () => null,
  discordStatus: async () => null,
  networkServers: async () => null,
}));

import { LocalMusicView } from "./LocalMusicView";
import { useLocalLibrary } from "../stores/localLibrary";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";
import type { LocalTrack } from "../lib/bridge";

function track(overrides: Partial<LocalTrack> & Pick<LocalTrack, "path" | "title">): LocalTrack {
  return {
    id: `local:${overrides.title}`,
    artist: "Bea",
    album: "Blue",
    duration: 185,
    size: 1,
    mtime: 1,
    ...overrides,
  };
}

const tracks: LocalTrack[] = [
  track({ path: "C:\\Music\\Alpha.mp3", title: "Alpha", artist: "Bea", album: "Blue", art: "localart://0123456789abcdef.jpg" }),
  track({ path: "C:\\Music\\Zed\\Zulu.mp3", title: "Zulu", artist: "Zed", album: "Green" }),
];
const libraryState = {
  folders: [
    { path: "C:\\Music", name: "Music", addedAt: 1 },
    { path: "D:\\Gone", name: "Gone", addedAt: 1, displayName: "Old drive" },
  ],
  scannedAt: Date.UTC(2026, 10, 1),
  tracks,
  unplayable: [{ format: "WMA", count: 3 }],
};

function setup(param?: string, extra: Partial<{ opened: LocalTrack[]; missing: string[] }> = {}) {
  useLocalLibrary.setState({
    library: libraryState,
    opened: extra.opened ?? [],
    missing: extra.missing ?? [],
    loaded: true,
    scanning: false,
  });
  useNavigation.setState({ view: { name: "local", param } });
  return render(<LocalMusicView />);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  player.shuffle = false;
  useUI.setState({ dialog: null, toasts: [] });
});

describe("LocalMusicView index", () => {
  it("asks for a folder when nothing is imported", () => {
    useLocalLibrary.setState({ library: { folders: [], scannedAt: 0, tracks: [], unplayable: [] }, opened: [], loaded: true });
    useNavigation.setState({ view: { name: "local" } });
    render(<LocalMusicView />);
    expect(screen.getByText("Play your own files")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose a folder" }));
    expect(bridge.pickFolder).toHaveBeenCalledWith("Choose a music folder");
  });

  it("lists All songs, each folder and the left-out count", () => {
    setup(undefined, { missing: ["D:\\Gone"] });
    expect(screen.getByRole("heading", { name: "Local Music" })).toBeTruthy();
    expect(screen.getByText(/^2 songs · 2 folders · Scanned /)).toBeTruthy();
    expect(screen.getByText("3 files left out: Hushio can't play WMA files.")).toBeTruthy();
    expect(screen.getByText("All songs")).toBeTruthy();
    expect(screen.getByText("Old drive")).toBeTruthy();
    expect(screen.getByText("Folder missing: check the drive, or remove it")).toBeTruthy();
    expect(screen.getByText("Import another folder")).toBeTruthy();
  });

  it("opens a folder when its card is chosen", () => {
    setup();
    fireEvent.click(screen.getByText("Old drive"));
    expect(useNavigation.getState().view).toEqual({ name: "local", param: "D:\\Gone" });
  });

  it("plays everything from the hero Play button", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(player.playQueue).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "local:Alpha" }), expect.objectContaining({ id: "local:Zulu" })]),
      0,
      "Local Music",
    );
  });

  it("lists opened files when there are any", () => {
    setup(undefined, { opened: [track({ path: "E:\\One.mp3", title: "One" })] });
    expect(screen.getByText("Opened files")).toBeTruthy();
  });
});

describe("LocalMusicView collection", () => {
  it("shows the songs of a folder with a search that filters them", () => {
    setup("C:\\Music");
    expect(screen.getByRole("button", { name: "Play Alpha" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play Zulu" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search your files"), { target: { value: "zulu" } });
    expect(screen.queryByRole("button", { name: "Play Alpha" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Search your files"), { target: { value: "nothing here" } });
    expect(screen.getByText("Nothing matches that search")).toBeTruthy();
  });

  it("plays a row from the queue at its position", () => {
    setup("C:\\Music");
    fireEvent.click(screen.getByRole("button", { name: "Play Zulu" }));
    expect(player.playQueue).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "local:Alpha" }), expect.objectContaining({ id: "local:Zulu" })],
      1,
      "Music",
    );
  });

  it("switches to albums and filters songs when one is opened", () => {
    setup("C:\\Music");
    fireEvent.click(screen.getByRole("button", { name: /^Albums/ }));
    fireEvent.click(screen.getByText("Blue"));
    expect(screen.getByText("← Clear filter: Blue")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play Alpha" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play Zulu" })).toBeNull();
    fireEvent.click(screen.getByText("← Clear filter: Blue"));
    expect(screen.getByRole("button", { name: "Play Zulu" })).toBeTruthy();
  });

  it("lists artists and filters songs by the chosen artist", () => {
    setup("C:\\Music");
    fireEvent.click(screen.getByRole("button", { name: /^Artists/ }));
    fireEvent.click(screen.getByRole("button", { name: /Zed/ }));
    expect(screen.getByText("← Clear filter: Zed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play Zulu" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play Alpha" })).toBeNull();
  });

  it("walks folders with a breadcrumb", () => {
    setup("C:\\Music");
    fireEvent.click(screen.getByRole("button", { name: /^Folders/ }));
    const folderCard = screen.getByText("Zed");
    fireEvent.click(folderCard);
    const path = screen.getByRole("navigation", { name: "Folder path" });
    expect(within(path).getByRole("button", { name: "Zed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play Zulu" })).toBeTruthy();
    fireEvent.click(within(path).getByRole("button", { name: "Music" }));
    expect(screen.queryByRole("navigation", { name: "Folder path" })).toBeNull();
  });

  it("warns when the folder is missing on disk", () => {
    setup("D:\\Gone", { missing: ["D:\\Gone"] });
    expect(screen.getByRole("alert").textContent).toContain("This folder can't be reached right now.");
  });

  it("opens a rename dialog for the folder", () => {
    setup("C:\\Music");
    fireEvent.click(screen.getByRole("button", { name: "Rename Music" }));
    expect(useUI.getState().dialog).toMatchObject({ title: 'Rename "Music"', initialValue: "Music", confirmLabel: "Rename" });
  });

  it("asks before removing a folder and says files stay on disk", () => {
    setup("C:\\Music");
    fireEvent.click(screen.getByRole("button", { name: "Remove Music" }));
    const dialog = useUI.getState().dialog;
    expect(dialog?.title).toBe('Remove "Music"?');
    expect(dialog?.body).toContain("Your files stay exactly where they are on disk.");
    expect(dialog?.danger).toBe(true);
  });

  it("lets opened files be removed one by one", () => {
    const opened = [track({ path: "E:\\One.mp3", title: "One" })];
    const forgetOpened = vi.fn(async () => {});
    useLocalLibrary.setState({ forgetOpened });
    setup("opened", { opened });
    expect(screen.getByText("Songs you opened with Hushio. The files stay where they are.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove One from Opened files" }));
    expect(forgetOpened).toHaveBeenCalledWith("local:One");
  });
});
