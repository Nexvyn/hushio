import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";

const { registerStreamUrl, streamProxyPort, resolveStream, pathExists } = vi.hoisted(() => ({
  registerStreamUrl: vi.fn(),
  streamProxyPort: vi.fn(),
  resolveStream: vi.fn(),
  pathExists: vi.fn(),
}));

vi.mock("./bridge", () => ({
  registerStreamUrl,
  streamProxyPort,
  pathExists,
  fileSrc: (path: string) => `asset://${path}`,
  persistRead: async () => null,
  persistWrite: async () => true,
}));
vi.mock("./resolveStream", () => ({ resolveStream }));

import {
  audio,
  headroomDb,
  pause,
  play,
  playStream,
  seekTo,
  setVolume,
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
  Object.defineProperty(audio, "duration", { value: duration, configurable: true });
  Object.defineProperty(audio, "currentTime", {
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
  setMediaTimes(Number.NaN, 0);
});

describe("playStream", () => {
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
    expect(audio.src).toBe(`http://127.0.0.1:4321/?id=${TEST_SONG_ID}`);
    useLibrary.setState({ downloads: {} });
  });

  it("resolves the test song, registers its URL and plays it through the proxy", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    expect(resolveStream).toHaveBeenCalledWith(TEST_SONG_ID, false);
    expect(registerStreamUrl).toHaveBeenCalledWith(TEST_SONG_ID, STREAM_URL);
    expect(audio.src).toBe(`http://127.0.0.1:4321/?id=${TEST_SONG_ID}`);
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

    audio.dispatchEvent(new Event("error"));

    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
    expect(resolveStream).toHaveBeenLastCalledWith(TEST_SONG_ID, true);
    expect(registerStreamUrl).toHaveBeenLastCalledWith(TEST_SONG_ID, RETRY_URL);
    expect(useUI.getState().toasts).toHaveLength(0);
  });

  it("resumes the retry at the position where playback broke", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    const seek = vi.fn();
    Object.defineProperty(audio, "currentTime", { configurable: true, get: () => 75, set: seek });

    audio.dispatchEvent(new Event("error"));

    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
    expect(seek).toHaveBeenCalledWith(75);
  });

  it("shows a message when the retry cannot resolve any source", async () => {
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    resolveStream.mockRejectedValueOnce(new Error("No Piped mirror had a playable stream"));

    audio.dispatchEvent(new Event("error"));

    await vi.waitFor(() => expect(useUI.getState().toasts).toHaveLength(1));
    expect(useUI.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: `Couldn't play "${TEST_SONG_TITLE}"`,
    });

    audio.dispatchEvent(new Event("error"));
    await settle();
    expect(resolveStream).toHaveBeenCalledTimes(2);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("allows another retry once the song has played 30 seconds past the last retry", async () => {
    setMediaTimes(200, 10);
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);

    audio.dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));

    setMediaTimes(200, 50);
    audio.dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(3));
    expect(resolveStream).toHaveBeenCalledTimes(3);

    setMediaTimes(200, 60);
    audio.dispatchEvent(new Event("error"));
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

    audio.dispatchEvent(new Event("error"));
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

    audio.dispatchEvent(new Event("error"));
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
    expect(audio.volume).toBeCloseTo(0.4);
    setVolume(1.7);
    expect(audio.volume).toBe(1);
    setVolume(-0.2);
    expect(audio.volume).toBe(0);
  });

  it("ignores a non-finite volume", () => {
    setVolume(0.6);
    setVolume(Number.NaN);
    expect(audio.volume).toBeCloseTo(0.6);
  });
});

describe("seekTo", () => {
  it("moves the playhead to the requested second", () => {
    setMediaTimes(200);
    seekTo(42.5);
    expect(audio.currentTime).toBe(42.5);
  });

  it("clamps to the song length and to zero", () => {
    setMediaTimes(200);
    seekTo(250);
    expect(audio.currentTime).toBe(200);
    seekTo(-5);
    expect(audio.currentTime).toBe(0);
  });

  it("does not clamp to the length while the duration is unknown", () => {
    setMediaTimes(Number.NaN);
    seekTo(90);
    expect(audio.currentTime).toBe(90);
  });

  it("ignores non-finite positions", () => {
    setMediaTimes(200, 10);
    seekTo(Number.NaN);
    expect(audio.currentTime).toBe(10);
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
    expect(ctx.createMediaElementSource).toHaveBeenCalledWith(mod.audio);
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
    mod.audio.dispatchEvent(new Event("playing"));

    expect(created[0].ctx.resume).toHaveBeenCalledTimes(2);
  });
});

describe("retry limits", () => {
  it("does not retry a failure that comes exactly 30 s after the last retry", async () => {
    setMediaTimes(200, 10);
    await playStream(TEST_SONG_ID, TEST_SONG_TITLE);
    audio.dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));

    setMediaTimes(200, 40);
    audio.dispatchEvent(new Event("error"));
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
