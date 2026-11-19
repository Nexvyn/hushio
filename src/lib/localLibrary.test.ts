import { describe, expect, it } from "vitest";
import type { LocalTrack } from "./bridge";
import type { DownloadItem } from "../stores/library";
import {
  albumGroups,
  artistGroups,
  artUrl,
  childPath,
  deviceTracks,
  filterDevice,
  folderListing,
  isDownloadedTrack,
  isLocalId,
  isUnderPath,
  joinOr,
  leftOutText,
  networkTrackUrl,
  scopeTracks,
  sortTracks,
  toTrack,
  unplayableToast,
} from "./localLibrary";

function track(overrides: Partial<LocalTrack> & { path: string; title: string }): LocalTrack {
  return {
    id: `local:${overrides.title}`,
    artist: "Artist",
    album: "Album",
    duration: 200,
    size: 1,
    mtime: 1,
    ...overrides,
  };
}

const ROOT = "C:\\Music";
const tracks: LocalTrack[] = [
  track({ path: "C:\\Music\\Zed\\Zulu.mp3", title: "Zulu", artist: "Zed", album: "Z Album", mtime: 30, art: "localart://0123456789abcdef.jpg" }),
  track({ path: "C:\\Music\\Alpha.mp3", title: "alpha", artist: "Bea", album: "Album", mtime: 10 }),
  track({ path: "C:\\Music\\Zed\\Deep\\Mid.mp3", title: "Mid", artist: "Zed", album: "Album", mtime: 20 }),
  track({ path: "D:\\Other\\Outside.mp3", title: "Outside", artist: "Ext", album: "Ext", mtime: 5 }),
];

describe("identity and paths", () => {
  it("recognises local track ids only", () => {
    expect(isLocalId("local:abc")).toBe(true);
    expect(isLocalId("dQw4w9WgXcQ")).toBe(false);
  });

  it("matches a folder and its children, ignoring case and separators", () => {
    expect(isUnderPath("c:/music/zed/a.mp3", "C:\\Music")).toBe(true);
    expect(isUnderPath("C:\\Music", "C:\\Music\\")).toBe(true);
    expect(isUnderPath("C:\\Music2\\a.mp3", "C:\\Music")).toBe(false);
    expect(isUnderPath("C:\\Music\\a.mp3", "")).toBe(false);
  });

  it("joins child paths with the parent's separator", () => {
    expect(childPath("C:\\Music", "Zed")).toBe("C:\\Music\\Zed");
    expect(childPath("/home/me/Music/", "Zed")).toBe("/home/me/Music/Zed");
    expect(childPath("C:\\", "Zed")).toBe("C:\\Zed");
  });
});

describe("art and playable tracks", () => {
  it("builds the platform specific localart URL", () => {
    expect(artUrl("localart://0123456789abcdef.jpg", "windows")).toBe("http://localart.localhost/0123456789abcdef.jpg");
    expect(artUrl("localart://0123456789abcdef.png", "android")).toBe("http://localart.localhost/0123456789abcdef.png");
    expect(artUrl("localart://0123456789abcdef.png", "linux")).toBe("localart://localhost/0123456789abcdef.png");
    expect(artUrl(undefined, "linux")).toBeNull();
  });

  it("maps a local track to a queue track with its cover", () => {
    expect(toTrack(tracks[0])).toEqual({
      id: "local:Zulu",
      title: "Zulu",
      artist: "Zed",
      thumb: artUrl(tracks[0].art),
    });
  });
});

describe("network track urls", () => {
  it("uses the http form on windows and android", () => {
    expect(networkTrackUrl("net:s1:/dav/Nova.mp3", "windows")).toBe("http://netmusic.localhost/s1%3A%2Fdav%2FNova.mp3");
    expect(networkTrackUrl("net:s1:/dav/Nova.mp3", "android")).toBe("http://netmusic.localhost/s1%3A%2Fdav%2FNova.mp3");
  });

  it("uses the custom scheme on the other platforms", () => {
    expect(networkTrackUrl("net:s1:/dav/Nova.mp3", "linux")).toBe("netmusic://localhost/s1%3A%2Fdav%2FNova.mp3");
  });

  it("encodes the spaces in a path", () => {
    expect(networkTrackUrl("net:s1:/dav/Nova - Song.mp3", "linux")).toBe("netmusic://localhost/s1%3A%2Fdav%2FNova%20-%20Song.mp3");
  });

  it("encodes # and ? so they stay part of the path", () => {
    const url = networkTrackUrl("net:s1:/dav/Why?#1.mp3", "linux");
    expect(url.slice("netmusic://localhost/".length)).not.toMatch(/[?#]/);
    expect(decodeURIComponent(url.slice("netmusic://localhost/".length))).toBe("s1:/dav/Why?#1.mp3");
  });

  it("keeps the leading slash of the path after a decode", () => {
    const url = networkTrackUrl("net:s1:/dav/a.mp3", "linux");
    expect(decodeURIComponent(url.slice("netmusic://localhost/".length))).toBe("s1:/dav/a.mp3");
  });
});

describe("scope and search", () => {
  it("returns everything for all, opened files for opened, and folder contents for a folder", () => {
    expect(scopeTracks(tracks, [], { kind: "all" }, "")).toHaveLength(4);
    expect(scopeTracks(tracks, [tracks[3]], { kind: "opened" }, "")).toEqual([tracks[3]]);
    const inFolder = scopeTracks(tracks, [], { kind: "folder", path: ROOT }, "");
    expect(inFolder.map((item) => item.title).sort()).toEqual(["Mid", "Zulu", "alpha"]);
  });

  it("searches title, artist and album without case sensitivity", () => {
    expect(scopeTracks(tracks, [], { kind: "all" }, "  ZULU ").map((item) => item.title)).toEqual(["Zulu"]);
    expect(scopeTracks(tracks, [], { kind: "all" }, "bea").map((item) => item.title)).toEqual(["alpha"]);
    expect(scopeTracks(tracks, [], { kind: "all" }, "z album").map((item) => item.title)).toEqual(["Zulu"]);
  });
});

describe("sorting", () => {
  it("sorts by title, artist then title, or newest file first", () => {
    expect(sortTracks(tracks, "title").map((item) => item.title)).toEqual(["alpha", "Mid", "Outside", "Zulu"]);
    expect(sortTracks(tracks, "artist").map((item) => item.artist)).toEqual(["Bea", "Ext", "Zed", "Zed"]);
    expect(sortTracks(tracks, "recent").map((item) => item.mtime)).toEqual([30, 20, 10, 5]);
  });
});

describe("albums and artists", () => {
  it("groups albums by album and artist with the first cover", () => {
    const groups = albumGroups(tracks);
    expect(groups.map((group) => `${group.album}|${group.artist}`)).toEqual([
      "Album|Bea",
      "Album|Zed",
      "Ext|Ext",
      "Z Album|Zed",
    ]);
    const zed = groups.find((group) => group.album === "Album" && group.artist === "Zed");
    expect(zed?.count).toBe(1);
    expect(groups.find((group) => group.album === "Z Album")?.art).toBe("http://localart.localhost/0123456789abcdef.jpg");
  });

  it("groups artists by name with song counts", () => {
    expect(artistGroups(tracks).map((group) => [group.artist, group.count])).toEqual([
      ["Bea", 1],
      ["Ext", 1],
      ["Zed", 2],
    ]);
  });
});

describe("folder walk", () => {
  it("lists subfolders with counts and the files at the level", () => {
    const listing = folderListing(tracks, ROOT);
    expect(listing.folders).toEqual([{ name: "Zed", path: "C:\\Music\\Zed", count: 2 }]);
    expect(listing.files.map((item) => item.title)).toEqual(["alpha"]);
  });

  it("walks into a subfolder", () => {
    const listing = folderListing(tracks, "C:\\Music\\Zed");
    expect(listing.folders).toEqual([{ name: "Deep", path: "C:\\Music\\Zed\\Deep", count: 1 }]);
    expect(listing.files.map((item) => item.title)).toEqual(["Zulu"]);
  });

  it("sorts subfolders in numeric order", () => {
    const numbered = [
      track({ path: "/m/Disc 10/a.mp3", title: "a" }),
      track({ path: "/m/Disc 2/b.mp3", title: "b" }),
    ];
    expect(folderListing(numbered, "/m").folders.map((folder) => folder.name)).toEqual(["Disc 2", "Disc 10"]);
  });
});

describe("unplayable copy", () => {
  it("joins formats with commas and or before the last", () => {
    expect(joinOr(["WMA"])).toBe("WMA");
    expect(joinOr(["WMA", "ALAC"])).toBe("WMA or ALAC");
    expect(joinOr(["WMA", "AIFF", "ALAC"])).toBe("WMA, AIFF or ALAC");
  });

  it("names the file type in the toast", () => {
    expect(unplayableToast(["WMA"])).toBe("Hushio can't play WMA files");
  });

  it("states how many files were left out, or nothing when none were", () => {
    expect(leftOutText([])).toBeNull();
    expect(
      leftOutText([
        { format: "WMA", count: 1 },
        { format: "ALAC", count: 2 },
      ]),
    ).toBe("3 files left out: Hushio can't play WMA or ALAC files.");
    expect(leftOutText([{ format: "AIFF", count: 1 }])).toBe("1 file left out: Hushio can't play AIFF files.");
  });
});

function download(id: string, overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    track: { id, title: `Saved ${id}`, artist: "Remote", thumb: "https://img.test/a.jpg", album: "", duration: 90 },
    path: `C:\\Downloads\\${id}.m4a`,
    status: "done",
    progress: 1,
    downloaded: 0,
    total: 0,
    ...overrides,
  };
}

describe("on this device", () => {
  it("adds finished downloads after the local files and skips ones already local", () => {
    const local = [track({ path: "C:\\Music\\Alpha.mp3", title: "Alpha" })];
    const merged = deviceTracks(local, [
      download("dl1"),
      download("local:Alpha", { status: "done" }),
      download("dl2", { status: "downloading" }),
      download("dl3", { path: null, status: "done" }),
    ]);
    expect(merged.map((item) => item.id)).toEqual(["local:Alpha", "dl1"]);
    expect(merged[1]).toMatchObject({ title: "Saved dl1", artist: "Remote", album: "Unknown album", art: "https://img.test/a.jpg" });
  });

  it("keeps a download's remote cover as a usable art url", () => {
    const [saved] = deviceTracks([], [download("dl1")]);
    expect(artUrl(saved.art, "windows")).toBe("https://img.test/a.jpg");
  });

  it("splits the list into local files and downloads", () => {
    const merged = deviceTracks([track({ path: "C:\\Music\\Alpha.mp3", title: "Alpha" })], [download("dl1")]);
    expect(merged.map(isDownloadedTrack)).toEqual([false, true]);
    expect(filterDevice(merged, "local").map((item) => item.id)).toEqual(["local:Alpha"]);
    expect(filterDevice(merged, "downloaded").map((item) => item.id)).toEqual(["dl1"]);
    expect(filterDevice(merged, "all")).toHaveLength(2);
  });
});
