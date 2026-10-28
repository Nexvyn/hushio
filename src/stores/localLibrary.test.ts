import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  localLibraryGet: vi.fn(),
  localLibraryOpened: vi.fn(),
  localLibraryFolderStatuses: vi.fn(),
  localLibraryScan: vi.fn(),
  localLibraryAddFolders: vi.fn(),
  localLibraryRemoveFolder: vi.fn(),
  localLibraryRenameFolder: vi.fn(),
  localLibraryForgetOpened: vi.fn(),
  localLibraryOpenFiles: vi.fn(),
  pickFolder: vi.fn(),
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
}));

vi.mock("../lib/bridge", () => ({ platform: "windows", ...bridge }));

import { useLocalLibrary } from "./localLibrary";
import { useSettings } from "./settings";
import { useUI } from "./ui";

const library = {
  folders: [{ path: "C:\\Music", name: "Music", addedAt: 1 }],
  scannedAt: 5,
  tracks: [],
  unplayable: [],
};

function toasts() {
  return useUI.getState().toasts.map((item) => `${item.kind}:${item.message}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ toasts: [] });
  useLocalLibrary.setState({ library, opened: [], missing: [], loaded: false, scanning: false });
  bridge.localLibraryFolderStatuses.mockResolvedValue([{ path: "C:\\Music", exists: true }]);
  bridge.localLibraryOpened.mockResolvedValue([]);
  bridge.localLibraryGet.mockResolvedValue(library);
});

describe("local library store", () => {
  it("refresh loads the index and marks folders that are gone", async () => {
    bridge.localLibraryFolderStatuses.mockResolvedValue([
      { path: "C:\\Music", exists: false },
      { path: "D:\\Gone", exists: false },
    ]);
    await useLocalLibrary.getState().refresh();
    expect(useLocalLibrary.getState().loaded).toBe(true);
    expect(useLocalLibrary.getState().missing).toEqual(["C:\\Music", "D:\\Gone"]);
  });

  it("scan uses the non-music filter setting and reports success", async () => {
    useSettings.setState({ filterNonMusicAudio: false });
    bridge.localLibraryScan.mockResolvedValue({ ...library, scannedAt: 9 });
    bridge.localLibraryGet.mockResolvedValue({ ...library, scannedAt: 9 });
    await useLocalLibrary.getState().scan();
    expect(bridge.localLibraryScan).toHaveBeenCalledWith(false);
    expect(useLocalLibrary.getState().library.scannedAt).toBe(9);
    expect(toasts()).toContain("success:Local library scanned");
    expect(useLocalLibrary.getState().scanning).toBe(false);
    useSettings.setState({ filterNonMusicAudio: true });
  });

  it("scan names unplayable formats in a warning toast", async () => {
    bridge.localLibraryScan.mockResolvedValue({ ...library, unplayable: [{ format: "WMA", count: 2 }] });
    await useLocalLibrary.getState().scan();
    expect(toasts()).toContain("warning:Hushio can't play WMA files");
  });

  it("scan failure shows an error and clears the scanning flag", async () => {
    bridge.localLibraryScan.mockRejectedValue(new Error("disk"));
    await useLocalLibrary.getState().scan();
    expect(toasts()).toContain("error:Scan failed");
    expect(useLocalLibrary.getState().scanning).toBe(false);
  });

  it("importing a folder that is already in the library says so and does not scan", async () => {
    bridge.localLibraryAddFolders.mockResolvedValue({ lib: library, added: [], skipped: ["C:\\Music"] });
    await useLocalLibrary.getState().importFolders(["C:\\Music"]);
    expect(toasts()).toContain("info:That folder is already in your library");
    expect(bridge.localLibraryScan).not.toHaveBeenCalled();
  });

  it("importing new folders scans and reports how many were added", async () => {
    const added = [
      { path: "C:\\Music\\A", name: "A", addedAt: 2 },
      { path: "C:\\Music\\B", name: "B", addedAt: 2 },
    ];
    bridge.localLibraryAddFolders.mockResolvedValue({ lib: library, added, skipped: [] });
    bridge.localLibraryScan.mockResolvedValue(library);
    await useLocalLibrary.getState().importFolders(["C:\\Music"]);
    expect(bridge.localLibraryScan).toHaveBeenCalled();
    expect(toasts()).toContain("success:Imported 2 folders");
  });

  it("importing a single folder names it", async () => {
    bridge.localLibraryAddFolders.mockResolvedValue({
      lib: library,
      added: [{ path: "C:\\Music\\A", name: "A", addedAt: 2 }],
      skipped: [],
    });
    bridge.localLibraryScan.mockResolvedValue(library);
    await useLocalLibrary.getState().importFolders(["C:\\Music\\A"]);
    expect(toasts()).toContain('success:Imported "A"');
  });

  it("a cancelled picker does nothing", async () => {
    bridge.pickFolder.mockResolvedValue(null);
    await useLocalLibrary.getState().importFromPicker();
    expect(bridge.localLibraryAddFolders).not.toHaveBeenCalled();
  });

  it("the picker uses the approved folder dialog and imports the folder it returns", async () => {
    bridge.pickFolder.mockResolvedValue("C:\\Music\\New");
    bridge.localLibraryAddFolders.mockResolvedValue({ lib: library, added: [], skipped: [] });
    await useLocalLibrary.getState().importFromPicker();
    expect(bridge.pickFolder).toHaveBeenCalledWith("Choose a music folder");
    expect(bridge.localLibraryAddFolders).toHaveBeenCalledWith(["C:\\Music\\New"]);
  });

  it("startup rescans quietly when at least one folder is imported", async () => {
    bridge.localLibraryScan.mockResolvedValue(library);
    await useLocalLibrary.getState().startupRescan();
    expect(bridge.localLibraryScan).toHaveBeenCalledTimes(1);
    expect(toasts()).not.toContain("success:Local library scanned");
    expect(useLocalLibrary.getState().scanning).toBe(false);
  });

  it("startup does not scan when no folder has been imported", async () => {
    bridge.localLibraryGet.mockResolvedValue({ ...library, folders: [] });
    await useLocalLibrary.getState().startupRescan();
    expect(bridge.localLibraryScan).not.toHaveBeenCalled();
  });

  it("remove drops the folder from state and says the files are untouched", async () => {
    bridge.localLibraryRemoveFolder.mockResolvedValue({ ...library, folders: [] });
    useLocalLibrary.setState({ missing: ["C:\\Music"] });
    await useLocalLibrary.getState().remove("C:\\Music");
    expect(useLocalLibrary.getState().library.folders).toEqual([]);
    expect(useLocalLibrary.getState().missing).toEqual([]);
    expect(toasts()).toContain("success:Removed from Hushio. Files untouched");
  });

  it("remove failure reports an error", async () => {
    bridge.localLibraryRemoveFolder.mockRejectedValue(new Error("nope"));
    await useLocalLibrary.getState().remove("C:\\Music");
    expect(toasts()).toContain("error:Couldn't remove the folder");
  });

  it("rename updates the index or reports failure", async () => {
    bridge.localLibraryRenameFolder.mockResolvedValue({ ...library, folders: [{ ...library.folders[0], displayName: "Mine" }] });
    await useLocalLibrary.getState().rename("C:\\Music", "Mine");
    expect(useLocalLibrary.getState().library.folders[0].displayName).toBe("Mine");
    bridge.localLibraryRenameFolder.mockRejectedValue(new Error("x"));
    await useLocalLibrary.getState().rename("C:\\Music", "Again");
    expect(toasts()).toContain("error:Couldn't rename");
  });

  it("opening files reloads the opened list and warns about unplayable types once each", async () => {
    bridge.localLibraryOpenFiles.mockResolvedValue({ tracks: [], folders: [], unplayable: ["AIFF", "AIFF"] });
    const result = await useLocalLibrary.getState().openFiles(["a.aiff", "b.aiff"]);
    expect(result.unplayable).toEqual(["AIFF", "AIFF"]);
    expect(toasts()).toContain("warning:Hushio can't play AIFF files");
    expect(bridge.localLibraryOpened).not.toHaveBeenCalled();
  });

  it("opening playable files refreshes the opened list", async () => {
    const opened = [{ id: "local:x", path: "C:\\x.mp3", title: "x", artist: "a", album: "b", duration: 40, size: 1, mtime: 1 }];
    bridge.localLibraryOpenFiles.mockResolvedValue({ tracks: opened, folders: [], unplayable: [] });
    bridge.localLibraryOpened.mockResolvedValue(opened);
    await useLocalLibrary.getState().openFiles(["C:\\x.mp3"]);
    expect(useLocalLibrary.getState().opened).toEqual(opened);
  });

  it("an IPC failure while opening files shows an error and returns nothing", async () => {
    bridge.localLibraryOpenFiles.mockRejectedValue(new Error("ipc"));
    const result = await useLocalLibrary.getState().openFiles(["C:\\x.mp3"]);
    expect(result).toEqual({ tracks: [], folders: [], unplayable: [] });
    expect(toasts()).toContain("error:Couldn't open those files");
  });

  it("forgetting an opened file replaces the list", async () => {
    bridge.localLibraryForgetOpened.mockResolvedValue([]);
    useLocalLibrary.setState({ opened: [{ id: "local:x", path: "p", title: "x", artist: "", album: "", duration: 0, size: 0, mtime: 0 }] });
    await useLocalLibrary.getState().forgetOpened("local:x");
    expect(useLocalLibrary.getState().opened).toEqual([]);
  });
});
