import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { useLibrary } from "../stores/library";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

const { registerStreamUrl, streamProxyPort, resolveStream, pathExists, localLibraryTrackPath } = vi.hoisted(() => ({
  registerStreamUrl: vi.fn(),
  streamProxyPort: vi.fn(),
  resolveStream: vi.fn(),
  pathExists: vi.fn(),
  localLibraryTrackPath: vi.fn(),
}));

vi.mock("./bridge", () => ({
  registerStreamUrl,
  streamProxyPort,
  pathExists,
  localLibraryTrackPath,
  fileSrc: (path: string) => `asset://${path}`,
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

import {
  activeDeck,
  type BlendEnd,
  type BlendTarget,
  audio,
  headroomDb,
  pause,
  play,
  playStream,
  seekTo,
  setVolume,
  standbyDeck,
  TEST_SONG_ID,
  TEST_SONG_TITLE,
} from "./audio";

const STREAM_URL = "https://r1---sn-test.googlevideo.com/videoplayback?itag=251";
const RETRY_URL = "https://r2---sn-test.googlevideo.com/videoplayback?itag=140";
const FLAT = Array.from({ length: 10 }, () => 0);
const EQ_HZ = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

function stream(url: string) {
  return { url, mime: "audio/webm", lufs: null };
}

function setMediaTimes(duration: number, currentTime = 0) {
  Object.defineProperty(activeDeck(), "duration", { value: duration, configurable: true });
  Object.defineProperty(activeDeck(), "currentTime", {
    value: currentTime,
    writable: true,
    configurable: true,
  });
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play");
const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause");

beforeEach(() => {
  vi.resetAllMocks();
  playSpy.mockResolvedValue(undefined);
  pauseSpy.mockImplementation(() => {});
  resolveStream.mockResolvedValue(stream(STREAM_URL));
  streamProxyPort.mockResolvedValue(4321);
  registerStreamUrl.mockResolvedValue(undefined);
  useUI.setState({ toasts: [], pendingToasts: [] });
  useSettings.setState({ loudnessLevel: "off" });
  setMediaTimes(Number.NaN, 0);
});

describe("playStream", () => {
  it("plays a local library file from its path without resolving a stream", async () => {
    localLibraryTrackPath.mockResolvedValue("/music/a.mp3");

    await playStream("local:abc", "A");

    expect(localLibraryTrackPath).toHaveBeenCalledWith("local:abc");
    expect(resolveStream).not.toHaveBeenCalled();
    expect(activeDeck().src).toBe("asset:///music/a.mp3");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("plays a downloaded song from its saved file without resolving a stream", async () => {
    useLibrary.setState({
      downloads: {
        [TEST_SONG_ID]: {
          track: { id: TEST_SONG_ID, title: TEST_SONG_TITLE, artist: "Artist", duration: 200 },
          path: "/music/song.m4a",
          status: "done",
          progress: 1,
          downloaded: 1,
          total: 1,
        },
      },
    });
    pathExists.mockResolvedValue(true);

    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    expect(resolveStream).not.toHaveBeenCalled();
    expect(activeDeck().src).toBe("asset:///music/song.m4a");
    expect(playSpy).toHaveBeenCalledTimes(1);
    useLibrary.setState({ downloads: {} });
  });

  it("streams instead of the saved file when the allowlist refuses its path", async () => {
    useLibrary.setState({
      downloads: {
        [TEST_SONG_ID]: {
          track: { id: TEST_SONG_ID, title: TEST_SONG_TITLE, artist: "Artist", duration: 200 },
          path: "/elsewhere/song.m4a",
          status: "done",
          progress: 1,
          downloaded: 1,
          total: 1,
        },
      },
    });
    pathExists.mockRejectedValue(new Error("Path is not in an approved folder"));

    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    expect(resolveStream).toHaveBeenCalledWith(TEST_SONG_ID, false);
    expect(activeDeck().src).toBe(`http://127.0.0.1:4321/?id=${TEST_SONG_ID}`);
    useLibrary.setState({ downloads: {} });
  });

  it("resolves the test song, registers its URL and plays it through the proxy", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    expect(resolveStream).toHaveBeenCalledWith(TEST_SONG_ID, false);
    expect(registerStreamUrl).toHaveBeenCalledWith(TEST_SONG_ID, STREAM_URL);
    expect(activeDeck().src).toBe(`http://127.0.0.1:4321/?id=${TEST_SONG_ID}`);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("does not register or play when the song cannot be resolved", async () => {
    resolveStream.mockRejectedValue(new Error("No Piped mirror had a playable stream"));

    await expect(playStream(TEST_SONG_ID, TEST_SONG_TITLE)).rejects.toThrow(
      "No Piped mirror had a playable stream",
    );
    expect(registerStreamUrl).not.toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("retries once with a fresh source when the element errors", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    resolveStream.mockResolvedValueOnce(stream(RETRY_URL));

    activeDeck().dispatchEvent(new Event("error"));

    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
    expect(resolveStream).toHaveBeenLastCalledWith(TEST_SONG_ID, true);
    expect(registerStreamUrl).toHaveBeenLastCalledWith(TEST_SONG_ID, RETRY_URL);
    expect(useUI.getState().toasts).toHaveLength(0);
  });

  it("resumes the retry at the position where playback broke", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    const seek = vi.fn();
    Object.defineProperty(activeDeck(), "currentTime", { configurable: true, get: () => 75, set: seek });

    activeDeck().dispatchEvent(new Event("error"));

    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
    expect(seek).toHaveBeenCalledWith(75);
  });

  it("shows a message when the retry cannot resolve any source", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    resolveStream.mockRejectedValueOnce(new Error("No Piped mirror had a playable stream"));

    activeDeck().dispatchEvent(new Event("error"));

    await vi.waitFor(() => expect(useUI.getState().toasts).toHaveLength(1));
    expect(useUI.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: `Couldn't play "${TEST_SONG_TITLE}"`,
    });

    activeDeck().dispatchEvent(new Event("error"));
    await settle();
    expect(resolveStream).toHaveBeenCalledTimes(2);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("allows another retry once the song has played 30 seconds past the last retry", async () => {
    setMediaTimes(200, 10);
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    activeDeck().dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));

    setMediaTimes(200, 50);
    activeDeck().dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(3));
    expect(resolveStream).toHaveBeenCalledTimes(3);

    setMediaTimes(200, 60);
    activeDeck().dispatchEvent(new Event("error"));
    await settle();
    expect(resolveStream).toHaveBeenCalledTimes(3);
    expect(useUI.getState().toasts).toHaveLength(1);
  });

  it("retries when play() rejects with an error other than AbortError", async () => {
    playSpy.mockRejectedValueOnce(new Error("NotSupportedError"));

    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    expect(resolveStream).toHaveBeenCalledTimes(2);
    expect(resolveStream).toHaveBeenLastCalledWith(TEST_SONG_ID, true);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("ignores an AbortError from play()", async () => {
    playSpy.mockRejectedValueOnce(new DOMException("The play() request was interrupted", "AbortError"));

    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    expect(resolveStream).toHaveBeenCalledTimes(1);
    expect(useUI.getState().toasts).toHaveLength(0);
  });

  it("does not retry after the song is paused", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    pause();

    activeDeck().dispatchEvent(new Event("error"));
    await settle();

    expect(resolveStream).toHaveBeenCalledTimes(1);
  });

  it("does not start a retry that was paused while its source resolved", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    let release: (value: unknown) => void = () => {};
    resolveStream.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    activeDeck().dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(resolveStream).toHaveBeenCalledTimes(2));
    pause();
    release(stream(RETRY_URL));
    await settle();

    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});

describe("transport", () => {
  it("pauses the element and resumes the same song", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    pause();
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    await play();
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("does nothing on play before a song is loaded", async () => {
    vi.resetModules();
    const fresh = await import("./audio");

    await fresh.play();

    expect(playSpy).not.toHaveBeenCalled();
  });

  it("sets the element volume and clamps it to the 0 to 1 range", () => {
    setVolume(0.4);
    expect(activeDeck().volume).toBeCloseTo(0.4);
    setVolume(1.7);
    expect(activeDeck().volume).toBe(1);
    setVolume(-0.2);
    expect(activeDeck().volume).toBe(0);
  });

  it("ignores a non-finite volume", () => {
    setVolume(0.6);
    setVolume(Number.NaN);
    expect(activeDeck().volume).toBeCloseTo(0.6);
  });
});

describe("seekTo", () => {
  it("moves the playhead to the requested second", () => {
    setMediaTimes(200);
    seekTo(42.5);
    expect(activeDeck().currentTime).toBe(42.5);
  });

  it("clamps to the song length and to zero", () => {
    setMediaTimes(200);
    seekTo(250);
    expect(activeDeck().currentTime).toBe(200);
    seekTo(-5);
    expect(activeDeck().currentTime).toBe(0);
  });

  it("does not clamp to the length while the duration is unknown", () => {
    setMediaTimes(Number.NaN);
    seekTo(90);
    expect(activeDeck().currentTime).toBe(90);
  });

  it("ignores non-finite positions", () => {
    setMediaTimes(200, 10);
    seekTo(Number.NaN);
    expect(activeDeck().currentTime).toBe(10);
  });
});

describe("headroomDb", () => {
  it("returns the peak when the track is at full level", () => {
    expect(headroomDb(6, 1)).toBe(6);
  });

  it("returns 0 when there is no boost or the peak is not a number", () => {
    expect(headroomDb(-3, 1)).toBe(0);
    expect(headroomDb(Number.NaN, 1)).toBe(0);
  });

  it("lowers the headroom by the track level in dB", () => {
    expect(headroomDb(12, 0.5)).toBeCloseTo(5.98, 2);
    expect(headroomDb(6, 0)).toBe(0);
  });
});

class FakeParam {
  value = 0;
  setTargetAtTime = vi.fn();
}

class FakeNode {
  connect = vi.fn((target: unknown) => target);
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeBiquad extends FakeNode {
  type = "";
  frequency = new FakeParam();
  Q = new FakeParam();
  gain = new FakeParam();

  getFrequencyResponse(_frequencies: Float32Array, magnitude: Float32Array) {
    magnitude.fill(10 ** (this.gain.value / 20));
  }
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}

type FakeState = "running" | "suspended";

function fakeContext(state: FakeState) {
  const sources: FakeNode[] = [];
  const filters: FakeBiquad[] = [];
  const gains: FakeGain[] = [];
  const compressors: FakeCompressor[] = [];
  const destination = new FakeNode();
  const ctx = {
    state,
    sampleRate: 48000,
    currentTime: 0,
    destination,
    resume: vi.fn(() => Promise.resolve()),
    createMediaElementSource: vi.fn(() => {
      const node = new FakeNode();
      sources.push(node);
      return node;
    }),
    createBiquadFilter: vi.fn(() => {
      const node = new FakeBiquad();
      filters.push(node);
      return node;
    }),
    createGain: vi.fn(() => {
      const node = new FakeGain();
      gains.push(node);
      return node;
    }),
    createDynamicsCompressor: vi.fn(() => {
      const node = new FakeCompressor();
      compressors.push(node);
      return node;
    }),
  };
  return { ctx, sources, filters, gains, compressors, destination };
}

describe("Web Audio graph", () => {
  let created: ReturnType<typeof fakeContext>[];
  let nextState: FakeState;

  beforeEach(() => {
    vi.resetModules();
    created = [];
    nextState = "running";
    class FakeAudioContext {
      constructor() {
        const fake = fakeContext(nextState);
        created.push(fake);
        return fake.ctx;
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadModule() {
    return import("./audio");
  }

  it("does not build the graph while EQ is off", async () => {
    const mod = await loadModule();

    mod.applyEq({ enabled: false, gains: FLAT, autoHeadroom: true });

    expect(created).toHaveLength(0);
  });

  it("routes the element through ten bands, the pre-gain, the limiter and the makeup gain", async () => {
    const mod = await loadModule();

    mod.applyEq({ enabled: true, gains: FLAT, autoHeadroom: true });

    expect(created).toHaveLength(1);
    const { ctx, sources, filters, gains, compressors, destination } = created[0];
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(2);
    expect(ctx.createMediaElementSource).toHaveBeenCalledWith(mod.activeDeck());
    expect(ctx.createMediaElementSource).toHaveBeenCalledWith(mod.standbyDeck());
    const bands = filters.slice(0, 10);
    expect(bands.map((band) => band.frequency.value)).toEqual(EQ_HZ);
    expect(bands[0].type).toBe("lowshelf");
    expect(bands[9].type).toBe("highshelf");
    bands.slice(1, 9).forEach((band) => expect(band.type).toBe("peaking"));

    const chain: FakeNode[] = [sources[0], ...bands, gains[0], compressors[0], gains[1], destination];
    chain.slice(0, -1).forEach((node, i) => expect(node.connect).toHaveBeenCalledWith(chain[i + 1]));
  });

  it("sets the limiter and the makeup gain from the spec values", async () => {
    const mod = await loadModule();

    mod.applyEq({ enabled: true, gains: FLAT, autoHeadroom: true });

    const { gains, compressors } = created[0];
    expect(compressors[0].threshold.value).toBe(-0.5);
    expect(compressors[0].knee.value).toBe(0);
    expect(compressors[0].ratio.value).toBe(20);
    expect(compressors[0].attack.value).toBe(0.002);
    expect(compressors[0].release.value).toBe(0.15);
    expect(gains[1].gain.value).toBeCloseTo(0.9677, 3);
  });

  it("sets each band to its gain and returns the bands to 0 dB when EQ is turned off", async () => {
    const mod = await loadModule();
    const gains = [3, ...FLAT.slice(1)];

    mod.applyEq({ enabled: true, gains, autoHeadroom: false });
    const bands = created[0].filters.slice(0, 10);
    expect(bands[0].gain.setTargetAtTime).toHaveBeenCalledWith(3, 0, 0.02);

    mod.applyEq({ enabled: false, gains, autoHeadroom: false });
    expect(bands[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.02);
  });

  it("lowers the pre-gain by the response peak when auto headroom is on", async () => {
    const mod = await loadModule();

    mod.applyEq({ enabled: true, gains: [6, ...FLAT.slice(1)], autoHeadroom: true });

    expect(created[0].gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
      expect.closeTo(10 ** (-6 / 20), 6),
      0,
      0.05,
    );
  });

  it("keeps the pre-gain at unity when auto headroom is off", async () => {
    const mod = await loadModule();

    mod.applyEq({ enabled: true, gains: [6, ...FLAT.slice(1)], autoHeadroom: false });

    expect(created[0].gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.05);
  });

  it("resumes a suspended context when EQ is applied", async () => {
    nextState = "suspended";
    const mod = await loadModule();

    mod.applyEq({ enabled: true, gains: FLAT, autoHeadroom: true });

    expect(created[0].ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("resumes a suspended context on the first playing event", async () => {
    nextState = "suspended";
    const mod = await loadModule();
    mod.applyEq({ enabled: true, gains: FLAT, autoHeadroom: true });

    created[0].ctx.state = "suspended";
    mod.activeDeck().dispatchEvent(new Event("playing"));

    expect(created[0].ctx.resume).toHaveBeenCalledTimes(2);
  });
});

describe("retry limits", () => {
  it("does not retry a failure that comes exactly 30 s after the last retry", async () => {
    setMediaTimes(200, 10);
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    activeDeck().dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));

    setMediaTimes(200, 40);
    activeDeck().dispatchEvent(new Event("error"));
    await settle();

    expect(resolveStream).toHaveBeenCalledTimes(2);
    expect(useUI.getState().toasts).toHaveLength(1);
  });

  it("gives up after one retry when play() keeps rejecting", async () => {
    playSpy.mockRejectedValue(new Error("NotSupportedError"));
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    expect(resolveStream).toHaveBeenCalledTimes(2);
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(useUI.getState().toasts).toHaveLength(1);
  });
});

describe("deck events", () => {
  it("forwards events from the active deck only", () => {
    const onPause = vi.fn();
    audio.addEventListener("pause", onPause);

    standbyDeck().dispatchEvent(new Event("pause"));
    expect(onPause).not.toHaveBeenCalled();

    activeDeck().dispatchEvent(new Event("pause"));
    expect(onPause).toHaveBeenCalledTimes(1);
  });
});

describe("crossfade and Automix", () => {
  type DeckState = { duration: number; currentTime: number; ended: boolean };
  const CURRENT = { id: "a", title: "A" };
  const states = new Map<HTMLAudioElement, DeckState>();

  let mod: typeof import("./audio");
  let settings: typeof import("../stores/settings");
  let queue: { id: string; title: string }[];
  let index: number;
  let upNext: Mock<() => BlendTarget | null>;
  let onComplete: Mock<(target: BlendTarget, end: BlendEnd) => void>;

  function timed(deck: HTMLAudioElement, duration: number): DeckState {
    const state: DeckState = { duration, currentTime: 0, ended: false };
    states.set(deck, state);
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

  function stateOf(deck: HTMLAudioElement): DeckState {
    const state = states.get(deck);
    if (!state) throw new Error("deck has no timing");
    return state;
  }

  async function flush() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  function playhead(seconds: number) {
    const deck = mod.activeDeck();
    stateOf(deck).currentTime = seconds;
    deck.dispatchEvent(new Event("timeupdate"));
  }

  function incomingPlays(): number {
    return playSpy.mock.contexts.filter((context) => context === mod.standbyDeck()).length;
  }

  function failIncomingPlay(error: Error) {
    const incoming = mod.standbyDeck();
    playSpy.mockImplementation(function (this: HTMLMediaElement) {
      return this === incoming ? Promise.reject(error) : Promise.resolve();
    });
  }

  async function startSong() {
    await mod.playStream(CURRENT.id, CURRENT.title);
  }

  async function reachBlendStart() {
    await startSong();
    playhead(195.5);
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    mod = await import("./audio");
    settings = await import("../stores/settings");
    timed(mod.activeDeck(), 200);
    timed(mod.standbyDeck(), 200);
    queue = [CURRENT, { id: "b", title: "B" }, { id: "c", title: "C" }];
    index = 0;
    upNext = vi.fn(() => (index + 1 < queue.length ? { ...queue[index + 1], index: index + 1 } : null));
    onComplete = vi.fn((target: { index: number }) => {
      index = target.index;
    });
    mod.setBlendHooks({
      upNext: () => upNext(),
      onComplete: (target, end) => onComplete(target, end),
    });
    settings.useSettings.setState({
      crossfadeSeconds: 4,
      smartFade: false,
      reduceAnimation: false,
      loudnessLevel: "off",
    });
    resolveStream.mockImplementation(async (id: string) => stream(`https://r1.googlevideo.com/${id}`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the next song and starts it the crossfade length before the end", async () => {
    await startSong();
    playhead(100);
    expect(mod.standbyDeck().getAttribute("src")).toBeNull();

    playhead(195.5);
    await flush();
    expect(mod.standbyDeck().getAttribute("src")).toBe("http://127.0.0.1:4321/?id=b");
    expect(incomingPlays()).toBe(0);

    await vi.advanceTimersByTimeAsync(499);
    expect(incomingPlays()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(incomingPlays()).toBe(1);
  });

  it("blends into a local file as the next song without resolving a stream", async () => {
    localLibraryTrackPath.mockResolvedValue("/music/b.mp3");
    queue[1] = { id: "local:b", title: "B" };
    await reachBlendStart();

    expect(mod.standbyDeck().getAttribute("src")).toBe("asset:///music/b.mp3");
    expect(resolveStream).not.toHaveBeenCalledWith("local:b", expect.anything());
  });

  it.each([3, 8])("sets the overlap from a %i s crossfade", async (seconds) => {
    settings.useSettings.setState({ crossfadeSeconds: seconds });
    await startSong();
    playhead(200 - seconds - 1);
    await flush();

    await vi.advanceTimersByTimeAsync(999);
    expect(incomingPlays()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(incomingPlays()).toBe(1);
  });

  it("uses a 6 s blend for Automix when the crossfade is 0", async () => {
    settings.useSettings.setState({ crossfadeSeconds: 0, smartFade: true });
    await startSong();
    playhead(193);
    await flush();

    await vi.advanceTimersByTimeAsync(999);
    expect(incomingPlays()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(incomingPlays()).toBe(1);
  });

  it("does not blend when the crossfade and Automix are both off", async () => {
    settings.useSettings.setState({ crossfadeSeconds: 0, smartFade: false });
    await startSong();
    playhead(199.5);
    await flush();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
    expect(incomingPlays()).toBe(0);
  });

  it("clamps an out-of-range crossfade length to 12 s", async () => {
    settings.useSettings.setState({ crossfadeSeconds: 30 });
    await startSong();
    playhead(187);
    await flush();

    await vi.advanceTimersByTimeAsync(999);
    expect(incomingPlays()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(incomingPlays()).toBe(1);
  });

  it("does not arm without a different next song", async () => {
    await startSong();
    upNext.mockReturnValue(null);
    playhead(195);
    await flush();
    expect(mod.standbyDeck().getAttribute("src")).toBeNull();

    upNext.mockReturnValue({ ...CURRENT, index: 0 });
    playhead(195.2);
    await flush();
    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
  });

  it("swaps the decks when the blend ends and reports the new song's position", async () => {
    const outgoing = mod.activeDeck();
    const incoming = mod.standbyDeck();
    await reachBlendStart();
    stateOf(incoming).currentTime = 1.5;

    await vi.advanceTimersByTimeAsync(4000);

    expect(onComplete).toHaveBeenCalledWith(
      { id: "b", title: "B", index: 1 },
      { position: 1.5, duration: 200, ended: false },
    );
    expect(mod.activeDeck()).toBe(incoming);
    expect(mod.standbyDeck()).toBe(outgoing);
    expect(outgoing.getAttribute("src")).toBeNull();
  });

  it("clamps the position to the length of the new song", async () => {
    const incoming = mod.standbyDeck();
    await reachBlendStart();
    stateOf(incoming).duration = 3;
    stateOf(incoming).currentTime = 10;

    await vi.advanceTimersByTimeAsync(4000);

    expect(onComplete).toHaveBeenCalledWith(
      { id: "b", title: "B", index: 1 },
      { position: 3, duration: 3, ended: false },
    );
  });

  it("fades along an equal-power curve scaled by the volume", async () => {
    mod.setVolume(0.8);
    const outgoing = mod.activeDeck();
    const incoming = mod.standbyDeck();
    await reachBlendStart();

    await vi.advanceTimersByTimeAsync(2000);

    expect(outgoing.volume).toBeCloseTo(0.8 * Math.SQRT1_2, 3);
    expect(incoming.volume).toBeCloseTo(0.8 * Math.SQRT1_2, 3);
  });

  it("freezes the blend while paused and resumes it where it stopped", async () => {
    await reachBlendStart();
    await vi.advanceTimersByTimeAsync(1000);

    mod.pause();
    await vi.advanceTimersByTimeAsync(10000);
    expect(onComplete).not.toHaveBeenCalled();

    await mod.play();
    await vi.advanceTimersByTimeAsync(2999);
    expect(onComplete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("aborts the blend when the playhead moves", async () => {
    const outgoing = mod.activeDeck();
    await reachBlendStart();

    mod.seekTo(50);
    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);

    expect(onComplete).not.toHaveBeenCalled();
    expect(mod.activeDeck()).toBe(outgoing);
  });

  it("aborts the blend when another song starts", async () => {
    await reachBlendStart();

    await mod.playStream("c", "C");
    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);

    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not retry a next song whose blend failed during the same song", async () => {
    const { useUI } = await import("../stores/ui");
    useUI.setState({ toasts: [], pendingToasts: [] });
    await reachBlendStart();

    mod.standbyDeck().dispatchEvent(new Event("error"));
    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    expect(useUI.getState().toasts).toHaveLength(0);

    playhead(195.5);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
    expect(resolveStream.mock.calls.filter(([id]) => id === "b")).toHaveLength(1);
  });

  it("ignores an AbortError from the next song's play()", async () => {
    failIncomingPlay(new DOMException("The play() request was interrupted", "AbortError"));
    await reachBlendStart();

    await vi.advanceTimersByTimeAsync(4000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("aborts the blend when the next song cannot play", async () => {
    failIncomingPlay(new Error("NotSupportedError"));
    await reachBlendStart();

    await vi.advanceTimersByTimeAsync(4000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
  });

  it("cuts the blend when Reduce animation is on", async () => {
    settings.useSettings.setState({ reduceAnimation: true });
    await startSong();
    playhead(195.5);
    await flush();
    await vi.advanceTimersByTimeAsync(5000);

    expect(mod.standbyDeck().getAttribute("src")).toBeNull();
    expect(incomingPlays()).toBe(0);
  });

  it("completes early and reports the end when the next song runs out first", async () => {
    await reachBlendStart();
    stateOf(mod.standbyDeck()).ended = true;

    await vi.advanceTimersByTimeAsync(25);

    expect(onComplete).toHaveBeenCalledWith(
      { id: "b", title: "B", index: 1 },
      expect.objectContaining({ ended: true }),
    );
  });

  it("arms the following blend from the song that just started", async () => {
    await reachBlendStart();
    await vi.advanceTimersByTimeAsync(4000);
    const incomingNow = mod.activeDeck();
    const outgoingNow = mod.standbyDeck();

    stateOf(incomingNow).currentTime = 195.5;
    incomingNow.dispatchEvent(new Event("timeupdate"));
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await flush();

    expect(outgoingNow.getAttribute("src")).toBe("http://127.0.0.1:4321/?id=c");
  });
});
