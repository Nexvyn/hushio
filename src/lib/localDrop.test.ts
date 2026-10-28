import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  openFiles: vi.fn(),
  importFolders: vi.fn(),
}));
const player = vi.hoisted(() => ({ playQueue: vi.fn() }));
const nav = vi.hoisted(() => ({ view: { name: "home" as string } }));

vi.mock("../stores/localLibrary", () => ({
  useLocalLibrary: { getState: () => store },
}));
vi.mock("../stores/player", () => ({
  usePlayer: { getState: () => player },
}));
vi.mock("../stores/navigation", () => ({
  useNavigation: { getState: () => ({ view: nav.view }) },
}));

import { dropPaths, OPENED_FROM } from "./localDrop";

const song = {
  id: "local:a",
  path: "C:\\a.mp3",
  title: "A",
  artist: "Artist",
  album: "Album",
  duration: 40,
  size: 1,
  mtime: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  nav.view = { name: "home" };
  store.openFiles.mockResolvedValue({ tracks: [], folders: [], unplayable: [] });
});

describe("dropPaths", () => {
  it("does nothing for an empty drop", async () => {
    await dropPaths([]);
    expect(store.openFiles).not.toHaveBeenCalled();
  });

  it("plays dropped audio files as opened files", async () => {
    store.openFiles.mockResolvedValue({ tracks: [song], folders: [], unplayable: [] });
    await dropPaths(["C:\\a.mp3"]);
    expect(store.openFiles).toHaveBeenCalledWith(["C:\\a.mp3"]);
    expect(player.playQueue).toHaveBeenCalledWith(
      [{ id: "local:a", title: "A", artist: "Artist", thumb: null }],
      0,
      OPENED_FROM,
    );
  });

  it("adds dropped folders when Local Music is open", async () => {
    nav.view = { name: "local" };
    store.openFiles.mockResolvedValue({ tracks: [], folders: ["C:\\Music"], unplayable: [] });
    await dropPaths(["C:\\Music"]);
    expect(store.importFolders).toHaveBeenCalledWith(["C:\\Music"]);
    expect(player.playQueue).not.toHaveBeenCalled();
  });

  it("ignores dropped folders on other views", async () => {
    store.openFiles.mockResolvedValue({ tracks: [], folders: ["C:\\Music"], unplayable: [] });
    await dropPaths(["C:\\Music"]);
    expect(store.importFolders).not.toHaveBeenCalled();
  });

  it("plays the audio in a mixed drop and adds the folders on Local Music", async () => {
    nav.view = { name: "local" };
    store.openFiles.mockResolvedValue({ tracks: [song], folders: ["C:\\Music"], unplayable: [] });
    await dropPaths(["C:\\a.mp3", "C:\\Music"]);
    expect(store.importFolders).toHaveBeenCalledWith(["C:\\Music"]);
    expect(player.playQueue).toHaveBeenCalledTimes(1);
  });
});
