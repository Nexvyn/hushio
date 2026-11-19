import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DownloadItem, type LibraryValues, LIBRARY_VERSION, useLibrary } from "./library";

vi.mock("../lib/bridge", () => ({
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
}));

function item(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    track: { id: "abc123", title: "Song", artist: "Artist", duration: 180 },
    path: null,
    status: "queued",
    progress: 0,
    downloaded: 0,
    total: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useLibrary.setState({ downloads: {} });
});

describe("library downloads state", () => {
  it("starts empty and persists under library version 7", () => {
    expect(LIBRARY_VERSION).toBe(7);
    expect(useLibrary.persist.getOptions().version).toBe(7);
    expect(useLibrary.getState().downloads).toEqual({});
  });

  it("sets, patches and removes a download row", () => {
    const store = useLibrary.getState();
    store.setDownload("abc123", item());
    store.patchDownload("abc123", { status: "downloading", progress: 0.25 });

    expect(useLibrary.getState().downloads.abc123).toMatchObject({ status: "downloading", progress: 0.25 });

    store.removeDownload("abc123");
    expect(useLibrary.getState().downloads).toEqual({});
  });

  it("ignores a patch for a row that does not exist", () => {
    useLibrary.getState().patchDownload("missing", { status: "failed" });

    expect(useLibrary.getState().downloads).toEqual({});
  });

  it("keeps other rows untouched when one changes", () => {
    const store = useLibrary.getState();
    store.setDownload("a", item({ track: { id: "a", title: "A", artist: "X", duration: 1 } }));
    store.setDownload("b", item({ track: { id: "b", title: "B", artist: "X", duration: 1 } }));
    store.patchDownload("a", { status: "done", path: "/a.m4a" });

    expect(useLibrary.getState().downloads.b.status).toBe("queued");
    expect(useLibrary.getState().downloads.a.path).toBe("/a.m4a");
  });

  it("persists downloads with the rest of the library", () => {
    useLibrary.getState().setDownload("abc123", item({ status: "done", path: "/a.m4a" }));
    const persisted = useLibrary.persist.getOptions().partialize?.(useLibrary.getState()) as LibraryValues;

    expect(persisted.downloads.abc123.path).toBe("/a.m4a");
  });
});

describe("library migration to version 4", () => {
  const migrate = () => useLibrary.persist.getOptions().migrate;

  it("adds an empty downloads map to a version 3 library", () => {
    const migrated = migrate()?.({ liked: [], history: [], playlists: [], folders: [] }, 3) as LibraryValues;

    expect(migrated.downloads).toEqual({});
    expect(migrated.liked).toEqual([]);
  });

  it("keeps stored downloads when they exist", () => {
    const stored = { abc123: item({ status: "done", path: "/a.m4a" }) };
    const migrated = migrate()?.({ downloads: stored }, 3) as LibraryValues;

    expect(migrated.downloads).toEqual(stored);
  });
});
