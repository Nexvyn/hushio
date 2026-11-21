import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  registerStreamUrl,
  streamProxyPort,
  resolveStream,
  pathExists,
  localLibraryTrackPath,
  playbackDiagnostic,
  trackAnalysis,
} = vi.hoisted(() => ({
    registerStreamUrl: vi.fn(),
    streamProxyPort: vi.fn(),
    resolveStream: vi.fn(),
    pathExists: vi.fn(),
    localLibraryTrackPath: vi.fn(),
    playbackDiagnostic: vi.fn(),
    trackAnalysis: vi.fn(),
  }));

vi.mock("./bridge", () => ({
  registerStreamUrl,
  streamProxyPort,
  pathExists,
  localLibraryTrackPath,
  localPlaybackSource: async (id: string) => {
    const path: string = await localLibraryTrackPath(id);
    return { url: `asset://${path}`, mime: "audio/mpeg" };
  },
  playbackDiagnostic,
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

function stream(id: string, lufs: number | null) {
  return { url: `https://r1.googlevideo.com/${id}`, mime: "audio/webm", lufs };
}

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play");
const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause");

let mod: typeof import("./audio");
let settings: typeof import("../stores/settings");
let main: Timing;

function playhead(seconds: number) {
  main.currentTime = seconds;
  mod.activeDeck().dispatchEvent(new Event("timeupdate"));
}

function incomingPlays(): number {
  return playSpy.mock.contexts.filter((context) => context === mod.standbyDeck()).length;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.resetAllMocks();
  playSpy.mockResolvedValue(undefined);
  pauseSpy.mockImplementation(() => {});
  resolveStream.mockImplementation(async (id: string) => stream(id, null));
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
    reduceAnimation: false,
    playbackSpeed: 1,
  });
  main = timed(mod.activeDeck(), 200);
  timed(mod.standbyDeck(), 200);
  mod.setBlendHooks({
    upNext: () => ({ id: "b", title: "B", index: 1 }),
    onComplete: () => {},
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  timings.clear();
});

describe("playback speed", () => {
  it("sets the speed and keeps the pitch on both decks at boot", () => {
    for (const deck of [mod.activeDeck(), mod.standbyDeck()]) {
      expect(deck.playbackRate).toBe(1);
      expect(deck.preservesPitch).toBe(true);
    }
  });

  it("applies a changed speed to both decks", () => {
    settings.useSettings.getState().setPlaybackSpeed(1.5);

    expect(mod.activeDeck().playbackRate).toBe(1.5);
    expect(mod.standbyDeck().playbackRate).toBe(1.5);
    expect(mod.activeDeck().preservesPitch).toBe(true);
    expect(mod.standbyDeck().preservesPitch).toBe(true);
  });

  it("reapplies the speed to a song that is loaded after the change", async () => {
    settings.useSettings.getState().setPlaybackSpeed(1.25);

    await mod.playStream("a", "A");

    expect(mod.activeDeck().playbackRate).toBe(1.25);
    expect(mod.activeDeck().preservesPitch).toBe(true);
  });

  it("times a blend by the playback rate", async () => {
    settings.useSettings.setState({ crossfadeSeconds: 4, playbackSpeed: 2 });
    await mod.playStream("a", "A");

    playhead(190);
    await flush();
    await vi.advanceTimersByTimeAsync(999);
    expect(incomingPlays()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await flush();

    expect(incomingPlays()).toBe(1);
  });

  it("clamps the stored speed to 0.5 to 2 in steps of 0.05", () => {
    const { setPlaybackSpeed } = settings.useSettings.getState();

    setPlaybackSpeed(0.2);
    expect(settings.useSettings.getState().playbackSpeed).toBe(0.5);
    setPlaybackSpeed(3);
    expect(settings.useSettings.getState().playbackSpeed).toBe(2);
    setPlaybackSpeed(1.23);
    expect(settings.useSettings.getState().playbackSpeed).toBe(1.25);
  });
});

describe("skip silence", () => {
  it("does not analyse a song when no setting needs the analysis", async () => {
    await mod.playStream("a", "A");

    main.duration = 200;
    mod.activeDeck().dispatchEvent(new Event("durationchange"));
    await flush();

    expect(trackAnalysis).not.toHaveBeenCalled();
  });

  it("starts a song after its leading silence once the analysis arrives", async () => {
    settings.useSettings.setState({ skipSilence: true });
    trackAnalysis.mockResolvedValue({ head: 2.5, tail: 0, lufs: null });
    await mod.playStream("a", "A");

    mod.activeDeck().dispatchEvent(new Event("durationchange"));
    await flush();

    expect(trackAnalysis).toHaveBeenCalledWith("http://127.0.0.1:4321/?id=a");
    expect(main.currentTime).toBe(2.5);
  });

  it("leaves the start alone when skip silence is off", async () => {
    trackAnalysis.mockResolvedValue({ head: 2.5, tail: 0, lufs: null });
    settings.useSettings.setState({ smartFade: true });
    await mod.playStream("a", "A");

    mod.activeDeck().dispatchEvent(new Event("durationchange"));
    await flush();

    expect(main.currentTime).toBe(0);
  });

  it("ends the song once the tail silence begins", async () => {
    settings.useSettings.setState({ skipSilence: true });
    trackAnalysis.mockResolvedValue({ head: 0, tail: 3, lufs: null });
    await mod.playStream("a", "A");
    mod.activeDeck().dispatchEvent(new Event("durationchange"));
    await flush();
    const ended = vi.fn();
    mod.audio.addEventListener("ended", ended);

    main.currentTime = 196.96;
    await vi.advanceTimersByTimeAsync(500);

    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("keeps playing while the playhead is before the tail", async () => {
    settings.useSettings.setState({ skipSilence: true });
    trackAnalysis.mockResolvedValue({ head: 0, tail: 3, lufs: null });
    await mod.playStream("a", "A");
    mod.activeDeck().dispatchEvent(new Event("durationchange"));
    await flush();
    const ended = vi.fn();
    mod.audio.addEventListener("ended", ended);

    main.currentTime = 150;
    await vi.advanceTimersByTimeAsync(5000);

    expect(ended).not.toHaveBeenCalled();
  });

  it("starts the blend at the tail edge, not at the end of the file", async () => {
    settings.useSettings.setState({ skipSilence: true, crossfadeSeconds: 4 });
    trackAnalysis.mockResolvedValue({ head: 0, tail: 10, lufs: null });
    await mod.playStream("a", "A");
    mod.activeDeck().dispatchEvent(new Event("durationchange"));
    await flush();

    playhead(185.5);
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();

    expect(incomingPlays()).toBe(1);
  });
});

describe("volume leveling", () => {
  it("levels a song with a known loudness toward the target", async () => {
    settings.useSettings.setState({ loudnessLevel: "normal" });
    resolveStream.mockResolvedValue(stream("a", -10));

    await mod.playStream("a", "A");

    expect(mod.activeDeck().volume).toBeCloseTo(10 ** (-4 / 20), 6);
  });

  it("uses the fallback loudness for a song with an unknown loudness", async () => {
    settings.useSettings.setState({ loudnessLevel: "loud" });

    await mod.playStream("a", "A");

    expect(mod.activeDeck().volume).toBeCloseTo(10 ** (-2 / 20), 6);
  });

  it("never boosts a quiet song above full volume", async () => {
    settings.useSettings.setState({ loudnessLevel: "loud" });
    resolveStream.mockResolvedValue(stream("a", -25));

    await mod.playStream("a", "A");

    expect(mod.activeDeck().volume).toBe(1);
  });

  it("stops at the 0.05 floor for a very loud song", async () => {
    settings.useSettings.setState({ loudnessLevel: "loud" });
    resolveStream.mockResolvedValue(stream("a", 20));

    await mod.playStream("a", "A");

    expect(mod.activeDeck().volume).toBeCloseTo(0.05, 6);
  });

  it("multiplies the leveling gain by the user volume", async () => {
    settings.useSettings.setState({ loudnessLevel: "normal" });
    resolveStream.mockResolvedValue(stream("a", -10));
    await mod.playStream("a", "A");

    mod.setVolume(0.5);

    expect(mod.activeDeck().volume).toBeCloseTo(0.5 * 10 ** (-4 / 20), 6);
  });

  it("plays a song as mastered when leveling is off", async () => {
    resolveStream.mockResolvedValue(stream("a", -10));

    await mod.playStream("a", "A");

    expect(mod.activeDeck().volume).toBe(1);
  });

  it("levels the incoming song on the standby deck during a blend", async () => {
    settings.useSettings.setState({ loudnessLevel: "normal", crossfadeSeconds: 4 });
    resolveStream.mockImplementation(async (id: string) => stream(id, id === "a" ? -20 : -10));
    await mod.playStream("a", "A");

    playhead(195.5);
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();
    await vi.advanceTimersByTimeAsync(2000);

    const half = Math.SQRT1_2;
    expect(mod.activeDeck().volume).toBeCloseTo(1 * half, 3);
    expect(mod.standbyDeck().volume).toBeCloseTo(10 ** (-4 / 20) * half, 3);
  });

  it("glides a level that arrives while the song plays over 2 seconds", async () => {
    settings.useSettings.setState({ loudnessLevel: "normal" });
    await mod.playStream("a", "A");
    const fallback = 10 ** (-5 / 20);
    expect(mod.activeDeck().volume).toBeCloseTo(fallback, 6);

    main.currentTime = 10;
    main.duration = 200;
    trackAnalysis.mockResolvedValue({ head: 0, tail: 0, lufs: -20 });
    mod.activeDeck().dispatchEvent(new Event("durationchange"));
    await flush();
    expect(mod.activeDeck().volume).toBeCloseTo(fallback, 2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mod.activeDeck().volume).toBeCloseTo(fallback + (1 - fallback) / 2, 2);

    await vi.advanceTimersByTimeAsync(1100);
    expect(mod.activeDeck().volume).toBe(1);
  });

  it("drops a glide at once when the leveling setting changes", async () => {
    settings.useSettings.setState({ loudnessLevel: "normal" });
    await mod.playStream("a", "A");
    main.currentTime = 10;
    main.duration = 200;
    trackAnalysis.mockResolvedValue({ head: 0, tail: 0, lufs: -20 });
    mod.activeDeck().dispatchEvent(new Event("durationchange"));
    await flush();

    settings.useSettings.setState({ loudnessLevel: "off" });

    expect(mod.activeDeck().volume).toBe(1);
  });
});

describe("clipping guard", () => {
  class FakeParam {
    value = 0;
    setTargetAtTime = vi.fn();
  }

  class FakeBand {
    type = "";
    frequency = new FakeParam();
    Q = new FakeParam();
    gain = new FakeParam();
    connect = vi.fn((target: unknown) => target);

    getFrequencyResponse(_frequencies: Float32Array, magnitude: Float32Array) {
      magnitude.fill(10 ** (this.gain.value / 20));
    }
  }

  function fakeNode() {
    return {
      gain: new FakeParam(),
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
      connect: vi.fn((target: unknown) => target),
    };
  }

  function stubContext() {
    const ctx = {
      state: "running",
      sampleRate: 48000,
      currentTime: 0,
      destination: fakeNode(),
      resume: vi.fn(() => Promise.resolve()),
      createMediaElementSource: vi.fn(() => fakeNode()),
      createBiquadFilter: vi.fn(() => new FakeBand()),
      createGain: vi.fn(() => fakeNode()),
      createDynamicsCompressor: vi.fn(() => fakeNode()),
    };
    class FakeAudioContext {
      constructor() {
        return ctx;
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    return ctx;
  }

  it("lowers the pre-gain as the track level rises and returns it to unity when the level leaves headroom", async () => {
    const ctx = stubContext();
    const boost = [6, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    mod.applyEq({ enabled: true, gains: boost, autoHeadroom: true });
    const preGain = ctx.createGain.mock.results[0].value.gain;
    expect(preGain.setTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(10 ** (-6 / 20), 5), 0, 0.05);

    mod.setVolume(0.8);
    expect(preGain.setTargetAtTime).toHaveBeenLastCalledWith(
      expect.closeTo(10 ** (-(6 + 20 * Math.log10(0.8)) / 20), 5),
      0,
      0.05,
    );

    mod.setVolume(0.5);
    expect(preGain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.05);
  });

  it.each([1, 0.8, 0.5, 0.2])("keeps the boosted peak at or under full scale at track level %s", async (level) => {
    const ctx = stubContext();
    const boostDb = 6;
    mod.applyEq({ enabled: true, gains: [boostDb, 0, 0, 0, 0, 0, 0, 0, 0, 0], autoHeadroom: true });
    const preGain = ctx.createGain.mock.results[0].value.gain;
    mod.setVolume(level);

    const pre = preGain.setTargetAtTime.mock.lastCall?.[0] as number;
    const peak = pre * level * 10 ** (boostDb / 20);
    expect(peak).toBeLessThanOrEqual(1 + 1e-6);
  });
});

function expiring(id: string, seconds: number) {
  const expire = Math.floor(Date.now() / 1000) + seconds;
  return { url: `https://r1.googlevideo.com/${id}?expire=${expire}`, mime: "audio/webm", lufs: null };
}

describe("resuming after a pause", () => {
  it("reloads a stream whose URL expired while paused, from the same position", async () => {
    resolveStream.mockImplementation(async (id: string) => expiring(id, 600));
    await mod.playStream("a", "A");
    playhead(42);
    mod.pause();
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);

    await mod.play();
    await flush();

    expect(resolveStream).toHaveBeenLastCalledWith("a", true);
    expect(main.currentTime).toBe(42);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("reloads a stream after a pause longer than ten minutes", async () => {
    await mod.playStream("a", "A");
    playhead(42);
    mod.pause();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1000);

    await mod.play();
    await flush();

    expect(resolveStream).toHaveBeenLastCalledWith("a", true);
    expect(main.currentTime).toBe(42);
  });

  it("resumes a fresh stream after a short pause without reloading it", async () => {
    resolveStream.mockImplementation(async (id: string) => expiring(id, 3600));
    await mod.playStream("a", "A");
    playhead(42);
    mod.pause();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    await mod.play();
    await flush();

    expect(resolveStream).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("never reloads a local file on resume", async () => {
    localLibraryTrackPath.mockResolvedValue("/music/a.mp3");
    await mod.playStream("local:abc", "A");
    mod.pause();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    await mod.play();
    await flush();

    expect(resolveStream).not.toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("never reloads a network track on resume", async () => {
    await mod.playStream("net:abc", "A");
    mod.pause();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    await mod.play();
    await flush();

    expect(resolveStream).not.toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("never reloads a downloaded song on resume", async () => {
    const { useLibrary } = await import("../stores/library");
    useLibrary.setState({
      downloads: {
        [mod.TEST_SONG_ID]: {
          track: { id: mod.TEST_SONG_ID, title: mod.TEST_SONG_TITLE, artist: "Artist", duration: 200 },
          path: "/music/song.m4a",
          status: "done",
          progress: 1,
          downloaded: 1,
          total: 1,
        },
      },
    });
    pathExists.mockResolvedValue(true);
    await mod.playStream(mod.TEST_SONG_ID, mod.TEST_SONG_TITLE);
    mod.pause();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    await mod.play();
    await flush();

    expect(resolveStream).not.toHaveBeenCalled();
    expect(mod.activeDeck().src).toBe("asset:///music/song.m4a");
  });

  it("allows a fresh retry when play is pressed after a retry has failed", async () => {
    await mod.playStream("a", "A");
    mod.activeDeck().dispatchEvent(new Event("error"));
    await flush();
    mod.activeDeck().dispatchEvent(new Event("error"));
    await flush();
    expect(resolveStream).toHaveBeenCalledTimes(2);

    await mod.play();
    await flush();
    mod.activeDeck().dispatchEvent(new Event("error"));
    await flush();

    expect(resolveStream).toHaveBeenCalledTimes(3);
    expect(resolveStream).toHaveBeenLastCalledWith("a", true);
  });
});

describe("stall watchdog", () => {
  it("refreshes the stream when the playhead does not move for 8 seconds", async () => {
    await mod.playStream("a", "A");

    await vi.advanceTimersByTimeAsync(8000);
    await flush();

    expect(resolveStream).toHaveBeenCalledTimes(2);
    expect(resolveStream).toHaveBeenLastCalledWith("a", true);
  });

  it("cancels the watchdog once the playhead moves", async () => {
    await mod.playStream("a", "A");
    await vi.advanceTimersByTimeAsync(4000);
    playhead(3);

    await vi.advanceTimersByTimeAsync(10000);
    await flush();

    expect(resolveStream).toHaveBeenCalledTimes(1);
  });

  it("does not fire for a deck that is paused", async () => {
    await mod.playStream("a", "A");
    mod.pause();

    await vi.advanceTimersByTimeAsync(10000);
    await flush();

    expect(resolveStream).toHaveBeenCalledTimes(1);
  });

  it("starts again when the deck reports waiting for data", async () => {
    await mod.playStream("a", "A");
    playhead(3);
    mod.activeDeck().dispatchEvent(new Event("waiting"));

    await vi.advanceTimersByTimeAsync(8000);
    await flush();

    expect(resolveStream).toHaveBeenLastCalledWith("a", true);
  });
});
