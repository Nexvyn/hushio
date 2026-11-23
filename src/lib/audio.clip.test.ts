import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { localPlaybackSource, localLibraryTrackPath } = vi.hoisted(() => ({
  localPlaybackSource: vi.fn(),
  localLibraryTrackPath: vi.fn(),
}));

vi.mock("./bridge", () => ({
  registerStreamUrl: vi.fn(),
  streamProxyPort: vi.fn(),
  pathExists: vi.fn(),
  localLibraryTrackPath,
  localPlaybackSource,
  playbackDiagnostic: vi.fn(),
  trackAnalysis: vi.fn(async () => ({ head: 0, tail: 0, lufs: null })),
  fileSrc: (path: string) => `asset://${path}`,
  platform: "windows",
  persistRead: async () => null,
  persistWrite: async () => true,
}));
vi.mock("./resolveStream", () => ({ resolveStream: vi.fn() }));
vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

type Timing = { duration: number; currentTime: number };
type TestDeck = ReturnType<typeof import("./audio").activeDeck>;

const CUE_ID = "local:0123456789abcdef-02";
const FILE_SECONDS = 200;

function timed(deck: TestDeck): Timing {
  const state: Timing = { duration: FILE_SECONDS, currentTime: 0 };
  Object.defineProperty(deck, "duration", { configurable: true, get: () => state.duration });
  Object.defineProperty(deck, "currentTime", {
    configurable: true,
    get: () => state.currentTime,
    set: (value: number) => {
      state.currentTime = value;
    },
  });
  return state;
}

const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play");
const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause");

let mod: typeof import("./audio");
let main: Timing;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.resetAllMocks();
  playSpy.mockResolvedValue(undefined);
  pauseSpy.mockImplementation(() => {});
  localPlaybackSource.mockResolvedValue({
    url: "asset:///music/album.flac",
    mime: "audio/flac",
    cueStart: 60,
    cueEnd: 120,
  });
  mod = await import("./audio");
  main = timed(mod.activeDeck());
  timed(mod.standbyDeck());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cue track clips", () => {
  it("seeks to the cue start after load and reports time and length from the clip", async () => {
    await mod.playStream(CUE_ID, "Two");

    expect(main.currentTime).toBe(60);
    expect(mod.audio.duration).toBe(60);
    expect(mod.audio.currentTime).toBe(0);
    expect(mod.getPlaybackPosition()).toBe(0);

    main.currentTime = 90;
    expect(mod.audio.currentTime).toBe(30);
    expect(mod.getPlaybackPosition()).toBe(30);
  });

  it("maps seeks into the clip and clamps them to its edges", async () => {
    await mod.playStream(CUE_ID, "Two");

    mod.seekTo(10);
    expect(main.currentTime).toBe(70);
    mod.seekTo(500);
    expect(main.currentTime).toBe(120);
    mod.seekTo(-4);
    expect(main.currentTime).toBe(60);
  });

  it("ends at the clip end and pauses the file before the ended flow runs", async () => {
    const ended = vi.fn();
    mod.audio.addEventListener("ended", ended);
    await mod.playStream(CUE_ID, "Two");

    main.currentTime = 119.5;
    vi.advanceTimersByTime(200);
    expect(ended).not.toHaveBeenCalled();

    main.currentTime = 120.2;
    vi.advanceTimersByTime(200);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(pauseSpy).toHaveBeenCalled();
  });

  it("plays a whole file with no clip as before", async () => {
    localPlaybackSource.mockResolvedValue({ url: "asset:///music/whole.flac", mime: "audio/flac" });
    await mod.playStream("local:abc", "Whole");

    expect(main.currentTime).toBe(0);
    expect(mod.audio.duration).toBe(FILE_SECONDS);
    main.currentTime = 150;
    expect(mod.audio.currentTime).toBe(150);
  });
});
