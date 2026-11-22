import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { registerStreamUrl, streamProxyPort, resolveStream, pathExists, trackAnalysis } = vi.hoisted(() => ({
  registerStreamUrl: vi.fn(),
  streamProxyPort: vi.fn(),
  resolveStream: vi.fn(),
  pathExists: vi.fn(),
  trackAnalysis: vi.fn(),
}));

vi.mock("./bridge", () => ({
  registerStreamUrl,
  streamProxyPort,
  pathExists,
  localLibraryTrackPath: vi.fn(),
  localPlaybackSource: vi.fn(),
  playbackDiagnostic: vi.fn(),
  trackAnalysis,
  fileSrc: (path: string) => `asset://${path}`,
  platform: "windows",
  persistRead: async () => null,
  persistWrite: async () => true,
}));
vi.mock("./resolveStream", () => ({ resolveStream }));
vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

type Timing = { duration: number; currentTime: number; ended: boolean };
type TestDeck = ReturnType<typeof import("./audio").activeDeck>;
const timings = new Map<TestDeck, Timing>();

function timed(deck: TestDeck, duration: number): Timing {
  const state: Timing = { duration, currentTime: 0, ended: false };
  timings.set(deck, state);
  Object.defineProperty(deck, "duration", { configurable: true, get: () => state.duration });
  Object.defineProperty(deck, "currentTime", {
    configurable: true,
    get: () => state.currentTime,
    set: (value: number) => {
      state.currentTime = value;
    },
  });
  Object.defineProperty(deck, "ended", { configurable: true, get: () => state.ended });
  return state;
}

function stream(id: string) {
  return { url: `https://r1.googlevideo.com/${id}`, mime: "audio/webm", lufs: null };
}

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play");
const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause");

let mod: typeof import("./audio");
let settings: typeof import("../stores/settings");
let main: Timing;
let onComplete: ReturnType<typeof vi.fn<(target: { id: string; index: number }, end: { ended: boolean }) => void>>;

function playhead(seconds: number) {
  main.currentTime = seconds;
  mod.activeDeck().dispatchEvent(new Event("timeupdate"));
}

function loadsOf(id: string): number {
  return resolveStream.mock.calls.filter(([called]) => called === id).length;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.resetAllMocks();
  playSpy.mockResolvedValue(undefined);
  pauseSpy.mockImplementation(() => {});
  resolveStream.mockImplementation(async (id: string) => stream(id));
  streamProxyPort.mockResolvedValue(4321);
  registerStreamUrl.mockResolvedValue(undefined);
  trackAnalysis.mockResolvedValue({ head: 0, tail: 0, lufs: null });
  mod = await import("./audio");
  settings = await import("../stores/settings");
  settings.useSettings.setState({
    loudnessLevel: "off",
    streamingQuality: "lossless",
    mobileStreamingQuality: "lossless",
    skipSilence: false,
    smartFade: false,
    crossfadeSeconds: 0,
    gaplessPlayback: true,
    reduceAnimation: false,
    playbackSpeed: 1,
  });
  main = timed(mod.activeDeck(), 200);
  timed(mod.standbyDeck(), 200);
  onComplete = vi.fn();
  mod.setBlendHooks({
    upNext: () => ({ id: "b", title: "B", index: 1 }),
    onComplete,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  timings.clear();
});

describe("gapless playback", () => {
  it("prepares the next song only inside the lead window", async () => {
    await mod.playStream("a", "A");
    await flush();

    playhead(100);
    await flush();
    expect(loadsOf("b")).toBe(0);

    playhead(195);
    await flush();
    expect(loadsOf("b")).toBe(1);
    expect(mod.standbyDeck().getAttribute("src")).toContain("id=b");
  });

  it("starts the prepared song at the end without a new load", async () => {
    await mod.playStream("a", "A");
    await flush();
    const before = mod.activeDeck();
    playhead(195);
    await flush();
    const ended = vi.fn();
    mod.audio.addEventListener("ended", ended);
    playSpy.mockClear();

    mod.activeDeck().dispatchEvent(new Event("ended"));
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ id: "b", index: 1 });
    expect(onComplete.mock.calls[0][1]).toMatchObject({ ended: false });
    expect(mod.activeDeck()).not.toBe(before);
    expect(loadsOf("b")).toBe(1);
    expect(playSpy.mock.contexts).toContain(mod.activeDeck());
    expect(ended).not.toHaveBeenCalled();
  });

  it("discards the prepared song when the user skips to another song", async () => {
    await mod.playStream("a", "A");
    await flush();
    playhead(195);
    await flush();
    expect(mod.standbyDeck().getAttribute("src")).not.toBeNull();

    await mod.playStream("c", "C");
    await flush();

    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("discards the prepared song when playback is paused", async () => {
    await mod.playStream("a", "A");
    await flush();
    playhead(195);
    await flush();

    mod.pause();

    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
  });

  it("falls back to the normal end when the next song fails to prepare", async () => {
    resolveStream.mockImplementation(async (id: string) => {
      if (id === "b") throw new Error("network down");
      return stream(id);
    });
    await mod.playStream("a", "A");
    await flush();
    playhead(195);
    await flush();
    const ended = vi.fn();
    mod.audio.addEventListener("ended", ended);

    mod.activeDeck().dispatchEvent(new Event("ended"));
    await flush();

    expect(ended).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps the normal end when the setting is off", async () => {
    settings.useSettings.setState({ gaplessPlayback: false });
    await mod.playStream("a", "A");
    await flush();
    playhead(195);
    await flush();
    const ended = vi.fn();
    mod.audio.addEventListener("ended", ended);

    mod.activeDeck().dispatchEvent(new Event("ended"));
    await flush();

    expect(loadsOf("b")).toBe(0);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps the crossfade blend when crossfade is greater than 0", async () => {
    settings.useSettings.setState({ crossfadeSeconds: 4 });
    await mod.playStream("a", "A");
    await flush();

    playhead(195);
    await flush();
    await vi.advanceTimersByTimeAsync(1500);
    await flush();

    expect(mod.standbyDeck().getAttribute("src")).not.toBeNull();
    expect(playSpy.mock.contexts).toContain(mod.standbyDeck());
  });
});
