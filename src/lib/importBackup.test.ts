import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  replayExport: vi.fn(async () => []),
  replayImport: vi.fn(async () => {}),
}));

import {
  backupFileName,
  buildBackup,
  confirmImportBackup,
  exportBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from "./importBackup";
import { replayExport, replayImport } from "./bridge";
import { DEFAULT_PINS, useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useRecents } from "../stores/recents";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

const NOT_BACKUP = "That doesn't look like a Hushio backup";

const initialSettings = useSettings.getState();
const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialRecents = useRecents.getState();
const initialToast = useUI.getState().toast;

const track = (id: string) => ({ id, title: `Title ${id}`, artist: `Artist ${id}`, thumb: null, album: null, duration: 0, explicit: false });

function envelope(state: object, version = 2) {
  return { state, version };
}

function doc(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: "hushio",
    version: 1,
    exportedAt: "2026-11-09T00:00:00.000Z",
    ...overrides,
  });
}

beforeEach(() => {
  useSettings.setState(initialSettings, true);
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useRecents.setState(initialRecents, true);
  vi.mocked(replayExport).mockClear();
  vi.mocked(replayImport).mockClear();
  useUI.setState({ toasts: [], pendingToasts: [], dialog: null, toast: initialToast });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildBackup", () => {
  it("writes the app, version, export time and sections", () => {
    const now = new Date("2026-11-09T21:00:00.000Z");
    const backup = buildBackup(now);
    expect(backup.app).toBe("hushio");
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe("2026-11-09T21:00:00.000Z");
    expect(backup.library?.version).toBe(7);
    expect(backup.player?.version).toBe(0);
    expect(Object.keys(backup.library?.state ?? {})).toEqual(
      expect.arrayContaining(["liked", "history", "playlists", "folders", "pinnedSingles"]),
    );
    expect(Object.keys(backup.player?.state ?? {})).toEqual(expect.arrayContaining(["queue", "index", "volume"]));
  });

  it("includes the listening buckets it is given as the listening section", () => {
    const buckets = [{ month: "2026-10", tracks: {}, artists: {}, hours: Array.from({ length: 24 }, () => 0), days: {} }];
    const backup = buildBackup(new Date("2026-11-09T21:00:00.000Z"), buckets);
    expect(backup.listening).toEqual({ state: { buckets }, version: 1 });
    expect(JSON.parse(serializeBackup(backup)).listening.state.buckets[0].month).toBe("2026-10");
  });

  it("writes an empty listening section when no buckets are given", () => {
    expect(buildBackup(new Date("2026-11-09T21:00:00.000Z")).listening).toEqual({ state: { buckets: [] }, version: 1 });
  });

  it("leaves out device settings and functions", () => {
    useSettings.setState({ downloadDir: "D:/music", audioSinkId: "speakers", matchLanguage: "tamil" });
    const { settings } = buildBackup();
    expect(settings).not.toHaveProperty("downloadDir");
    expect(settings).not.toHaveProperty("audioSinkId");
    expect(settings).not.toHaveProperty("setValue");
    expect(settings?.matchLanguage).toBe("tamil");
  });

  it("trims recent searches, drops blanks and keeps at most 50", () => {
    const searches = ["  one ", "", "   ", ...Array.from({ length: 60 }, (_, index) => `s${index}`)];
    useRecents.setState({ searches });
    const backup = buildBackup();
    expect(backup.recentSearches).toHaveLength(50);
    expect(backup.recentSearches?.[0]).toBe("one");
    expect(backup.recentSearches).not.toContain("");
  });

  it("serialises as pretty JSON with a trailing newline", () => {
    const text = serializeBackup(buildBackup(new Date("2026-01-02T03:04:05Z")));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "app": "hushio"');
  });

  it("names the file with the UTC date", () => {
    expect(backupFileName(new Date("2026-11-09T23:30:00-05:00"))).toBe("hushio-backup-2026-11-10.json");
  });
});

describe("parseBackup", () => {
  it("rejects text that is not JSON or not an object", () => {
    expect(() => parseBackup("{nope")).toThrow(NOT_BACKUP);
    expect(() => parseBackup("[1, 2]")).toThrow(NOT_BACKUP);
  });

  it("rejects a backup from another app", () => {
    expect(() => parseBackup(doc({ app: "other" }))).toThrow("That backup is from another app");
  });

  it("accepts only the integer version 1", () => {
    expect(() => parseBackup(doc({ version: 0 }))).toThrow(NOT_BACKUP);
    expect(() => parseBackup(doc({ version: -1 }))).toThrow(NOT_BACKUP);
    expect(() => parseBackup(doc({ version: 1.5 }))).toThrow(NOT_BACKUP);
    expect(() => parseBackup(doc({ version: "1" }))).toThrow(NOT_BACKUP);
    expect(parseBackup(doc()).version).toBe(1);
  });

  it("reports a newer backup", () => {
    expect(() => parseBackup(doc({ version: 2 }))).toThrow("That backup was written by a newer version of Hushio");
  });

  it("reports a malformed listening section by name", () => {
    expect(() => parseBackup(doc({ listening: { state: "x", version: 1 } }))).toThrow(
      "That doesn't look like a Hushio backup (malformed listening section)",
    );
  });

  it("reports malformed library and player sections by name", () => {
    expect(() => parseBackup(doc({ library: { state: [], version: 2 } }))).toThrow(
      "That doesn't look like a Hushio backup (malformed library section)",
    );
    expect(() => parseBackup(doc({ player: { state: {}, version: "x" } }))).toThrow(
      "That doesn't look like a Hushio backup (malformed player section)",
    );
  });

  it("keeps valid sections and filters recent searches to strings", () => {
    const parsed = parseBackup(
      doc({
        settings: { theme: "dark" },
        library: envelope({ liked: [] }),
        recentSearches: ["a", 3, "b"],
      }),
    );
    expect(parsed.settings).toEqual({ theme: "dark" });
    expect(parsed.library).toEqual({ state: { liked: [] }, version: 2 });
    expect(parsed.player).toBeUndefined();
    expect(parsed.recentSearches).toEqual(["a", "b"]);
  });
});

describe("restoreBackup settings", () => {
  it("keeps device settings and applies only values that pass the checks", () => {
    useSettings.setState({ downloadDir: "C:/mine", audioSinkId: "mine", streamingQuality: "high", crossfadeSeconds: 0 });
    restoreBackup(
      parseBackup(
        doc({
          settings: {
            downloadDir: "D:/other",
            audioSinkId: "theirs",
            streamingQuality: "ultra",
            loudnessLevel: "quiet",
            matchLanguage: "klingon",
            crossfadeSeconds: 99,
            playbackSpeed: 1.5,
            theme: "light",
            skipSilence: true,
            unknownKey: 1,
          },
        }),
      ),
    );
    const state = useSettings.getState();
    expect(state.downloadDir).toBe("C:/mine");
    expect(state.audioSinkId).toBe("mine");
    expect(state.streamingQuality).toBe("high");
    expect(state.loudnessLevel).toBe("quiet");
    expect(state.matchLanguage).toBe("");
    expect(state.crossfadeSeconds).toBe(0);
    expect(state.playbackSpeed).toBe(1.5);
    expect(state.theme).toBe("light");
    expect(state.skipSilence).toBe(true);
    expect(state).not.toHaveProperty("unknownKey");
  });

  it("keeps the current settings when the backup has no settings section", () => {
    useSettings.setState({ theme: "dark" });
    restoreBackup(parseBackup(doc()));
    expect(useSettings.getState().theme).toBe("dark");
  });
});

describe("restoreBackup library, player and searches", () => {
  it("replaces the library with the backup contents", () => {
    useLibrary.setState({ liked: [track("old")], playlists: [{ id: "p-old", name: "Old", folderId: null, pinned: false, tracks: [] }] });
    restoreBackup(
      parseBackup(
        doc({
          library: envelope({
            liked: [track("new")],
            history: [],
            playlists: [{ id: "p1", name: "Mine", folderId: null, pinned: false, tracks: [] }],
            pinnedSingles: { liked: false },
            libraryOrder: ["playlist:p1", 7],
          }),
        }),
      ),
    );
    const state = useLibrary.getState();
    expect(state.liked.map((item) => item.id)).toEqual(["new"]);
    expect(state.playlists.map((item) => item.id)).toEqual(["p1"]);
    expect(state.pinnedSingles).toEqual({ ...DEFAULT_PINS, liked: false });
    expect(state.libraryOrder).toEqual(["playlist:p1"]);
  });

  it("sends the listening buckets to the replay store", () => {
    restoreBackup(parseBackup(doc({ listening: envelope({ buckets: [{ month: "2026-10" }] }, 1) })));
    expect(replayImport).toHaveBeenCalledWith([{ month: "2026-10" }]);
  });

  it("normalises restored playlists and drops broken tracks, so a playlist without tracks cannot crash the library", () => {
    restoreBackup(
      parseBackup(
        doc({
          library: envelope({
            playlists: [
              { id: "p1", name: "Bare", folderId: null, pinned: false },
              { id: "p2", name: "Mixed", folderId: null, pinned: false, tracks: [{ nope: true }, track("a")] },
            ],
          }),
        }),
      ),
    );
    const playlists = useLibrary.getState().playlists;
    expect(playlists[0].tracks).toEqual([]);
    expect(playlists[1].tracks.map((item) => item.id)).toEqual(["a"]);
  });

  it("keeps the current listening stats when the backup has no listening section", () => {
    restoreBackup(parseBackup(doc({ recentSearches: [] })));
    expect(replayImport).not.toHaveBeenCalled();
  });

  it("reports a listening history that the replay store cannot take", async () => {
    vi.mocked(replayImport).mockRejectedValueOnce(new Error("store locked"));
    const toast = vi.fn();
    useUI.setState({ toast });
    restoreBackup(parseBackup(doc({ listening: envelope({ buckets: [] }, 1) })));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("store locked", "error"));
  });

  it("restores a valid queue and clamps the index into it", () => {
    restoreBackup(
      parseBackup(
        doc({
          player: envelope({ queue: [track("a"), track("b")], index: 9, volume: 0.4, shuffle: true, repeat: "all" }, 0),
        }),
      ),
    );
    const state = usePlayer.getState();
    expect(state.queue.map((item) => item.id)).toEqual(["a", "b"]);
    expect(state.index).toBe(1);
    expect(state.volume).toBe(0.4);
    expect(state.shuffle).toBe(true);
    expect(state.repeat).toBe("all");
  });

  it("ignores a queue with broken entries", () => {
    usePlayer.setState({ queue: [track("keep")], index: 0 });
    restoreBackup(parseBackup(doc({ player: envelope({ queue: [{ nope: true }], index: 0 }, 0) })));
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["keep"]);
  });

  it("replaces recent searches and caps them at 50", () => {
    restoreBackup(parseBackup(doc({ recentSearches: Array.from({ length: 70 }, (_, index) => `q${index}`) })));
    expect(useRecents.getState().searches).toHaveLength(50);
    expect(useRecents.getState().searches[0]).toBe("q0");
  });
});

describe("export and import entry points", () => {
  it("downloads the backup as a file with the replay buckets and reports success", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:backup");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const toast = vi.fn();
    useUI.setState({ toast });
    vi.mocked(replayExport).mockResolvedValueOnce([{ month: "2026-11", tracks: {}, artists: {}, hours: [], days: {} }]);

    await exportBackup(new Date("2026-11-09T12:00:00Z"));

    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(createObjectURL.mock.calls[0][0]);
    });
    expect(JSON.parse(text).listening.state.buckets[0].month).toBe("2026-11");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Backup saved", "success");
  });

  it("asks before importing and explains what is replaced", () => {
    confirmImportBackup();
    const dialog = useUI.getState().dialog;
    expect(dialog?.title).toBe("Import a backup?");
    expect(dialog?.body).toBe("Your current library, playlists and history will be replaced by the backup's.");
    expect(dialog?.confirmLabel).toBe("Choose file");
    expect(dialog?.danger).toBe(true);
  });
});
