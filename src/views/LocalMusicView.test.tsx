import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const device = vi.hoisted(() => ({ phone: false }));
const player = vi.hoisted(() => ({
  playQueue: vi.fn(),
  shuffle: false,
  toggleShuffle: vi.fn(),
}));
const bridge = vi.hoisted(() => ({
  pickFolder: vi.fn(async () => null),
  localLibraryRemoveFolder: vi.fn(),
  downloadDeleteFile: vi.fn(async () => undefined),
}));

vi.mock("../stores/player", () => ({ usePlayer: { getState: () => player } }));
vi.mock("../lib/usePhone", () => ({ usePhone: () => device.phone }));
vi.mock("../lib/bridge", () => ({
  platform: "windows",
  pickFolder: bridge.pickFolder,
  localLibraryRemoveFolder: bridge.localLibraryRemoveFolder,
  downloadDeleteFile: bridge.downloadDeleteFile,
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
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
import { useLibrary, type DownloadItem } from "../stores/library";
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
  device.phone = false;
  vi.clearAllMocks();
  player.shuffle = false;
  useUI.setState({ dialog: null, toasts: [] });
  useLibrary.setState({ downloads: {} });
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

  it("centers the empty prompt in the remaining phone page space", () => {
    device.phone = true;
    useLocalLibrary.setState({ library: { folders: [], scannedAt: 0, tracks: [], unplayable: [] }, opened: [], loaded: true });
    useNavigation.setState({ view: { name: "local" } });
    render(<LocalMusicView />);
    expect(screen.getByText("Play your own files").closest("section")?.className).toContain("min-h-[calc(100dvh-var(--phone-empty-offset,240px))]");
  });

  it("lists All songs, each folder and the left-out count", () => {
    setup(undefined, { missing: ["D:\\Gone"] });
    expect(screen.getByRole("heading", { name: "Local music" })).toBeTruthy();
    expect(screen.getByText(/^2 songs · 2 folders · Scanned /)).toBeTruthy();
    expect(screen.getByText("3 files left out: Hushio can't play WMA files.")).toBeTruthy();
    expect(screen.getByText("On this device")).toBeTruthy();
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
      "Local music",
    );
  });

  it("lists opened files when there are any", () => {
    setup(undefined, { opened: [track({ path: "E:\\One.mp3", title: "One" })] });
    expect(screen.getByText("Opened files")).toBeTruthy();
  });
});

const savedDownload: DownloadItem = {
  track: { id: "dl1", title: "Saved Song", artist: "Web Artist", album: "Web", duration: 120, thumb: "https://img.test/s.jpg" },
  path: "C:\\Downloads\\saved.m4a",
  status: "done",
  progress: 1,
  downloaded: 0,
  total: 0,
};

describe("LocalMusicView on this device", () => {
  beforeEach(() => {
    useLibrary.setState({ downloads: { dl1: savedDownload } });
  });

  it("lists local files and downloads together, sorted by title", () => {
    setup("all");
    expect(screen.getByRole("button", { name: "Play Alpha" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play Saved Song" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play Zulu" })).toBeTruthy();
  });

  it("filters the list to local files or downloads with the chips", () => {
    setup("all");
    fireEvent.click(screen.getByRole("button", { name: /^Downloaded/ }));
    expect(screen.queryByRole("button", { name: "Play Alpha" })).toBeNull();
    expect(screen.getByRole("button", { name: "Play Saved Song" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Local files/ }));
    expect(screen.getByRole("button", { name: "Play Alpha" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play Saved Song" })).toBeNull();
  });

  it("explains an empty downloads filter", () => {
    useLibrary.setState({ downloads: {} });
    setup("all");
    fireEvent.click(screen.getByRole("button", { name: /^Downloaded/ }));
    expect(screen.getByText("No downloads yet")).toBeTruthy();
  });

  it("marks only the downloaded rows with a badge", () => {
    setup("all");
    expect(screen.getAllByTitle("Downloaded")).toHaveLength(1);
  });

  it("searches local files and downloads together", () => {
    setup("all");
    fireEvent.change(screen.getByPlaceholderText("Search your files"), { target: { value: "web" } });
    expect(screen.getByRole("button", { name: "Play Saved Song" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play Alpha" })).toBeNull();
  });

  it("plays a downloaded row through the queue at its position", () => {
    setup("all");
    fireEvent.click(screen.getByRole("button", { name: "Play Saved Song" }));
    expect(player.playQueue).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: "local:Alpha" }),
        expect.objectContaining({ id: "dl1", thumb: "https://img.test/s.jpg" }),
        expect.objectContaining({ id: "local:Zulu" }),
      ],
      1,
      "On this device",
    );
  });

  it("removes a download from its row menu and deletes the file", () => {
    setup("all");
    fireEvent.click(screen.getByRole("button", { name: "More options for Saved Song" }));
    const remove = useUI.getState().contextMenu?.items.find((entry) => entry.label === "Remove download");
    expect(remove).toBeTruthy();
    remove?.onSelect?.();
    expect(bridge.downloadDeleteFile).toHaveBeenCalledWith("C:\\Downloads\\saved.m4a");
    expect(useLibrary.getState().downloads.dl1).toBeUndefined();
  });

  it("gives local files an Edit info row menu but no download removal", () => {
    setup("all");
    fireEvent.click(screen.getByRole("button", { name: "More options for Alpha" }));
    const labels = useUI.getState().contextMenu?.items.map((entry) => entry.label);
    expect(labels).toContain("Edit info");
    expect(labels).not.toContain("Remove download");
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

  it("lists a downloads-only library with the on-device card", () => {
    useLocalLibrary.setState({ library: { folders: [], scannedAt: 0, tracks: [], unplayable: [] }, opened: [], loaded: true });
    useLibrary.setState({ downloads: { dl1: savedDownload } });
    useNavigation.setState({ view: { name: "local" } });
    render(<LocalMusicView />);
    expect(screen.getByText("On this device")).toBeTruthy();
    expect(screen.queryByText("Play your own files")).toBeNull();
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
