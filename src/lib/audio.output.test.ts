import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./bridge", () => ({
  registerStreamUrl: vi.fn(),
  streamProxyPort: vi.fn(),
  pathExists: vi.fn(),
  localLibraryTrackPath: vi.fn(),
  fileSrc: (path: string) => `asset://${path}`,
  trackAnalysis: vi.fn(),
}));
vi.mock("./resolveStream", () => ({ resolveStream: vi.fn() }));
vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

class FakeParam {
  value = 0;
  setTargetAtTime = vi.fn();
}

class FakeNode {
  connect = vi.fn();
}

class FakeBiquad extends FakeNode {
  frequency = new FakeParam();
  Q = new FakeParam();
  gain = new FakeParam();
  type = "peaking";
  getFrequencyResponse = vi.fn((_frequencies: Float32Array, magnitude: Float32Array) => {
    magnitude.fill(2);
  });
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}

function fakeContext(state: "running" | "suspended") {
  const filters: FakeBiquad[] = [];
  const gains: FakeGain[] = [];
  const ctx = {
    state,
    sampleRate: 48000,
    currentTime: 0,
    sinkId: "",
    destination: new FakeNode(),
    resume: vi.fn(async () => {}),
    setSinkId: vi.fn(async (_sinkId: string) => {}),
    createMediaElementSource: vi.fn(() => new FakeNode()),
    createBiquadFilter: vi.fn(() => {
      const filter = new FakeBiquad();
      filters.push(filter);
      return filter;
    }),
    createGain: vi.fn(() => {
      const gain = new FakeGain();
      gains.push(gain);
      return gain;
    }),
    createDynamicsCompressor: vi.fn(() => new FakeCompressor()),
  };
  return { ctx, filters, gains };
}

let created: ReturnType<typeof fakeContext>[];
let nextState: "running" | "suspended";

beforeAll(async () => {
  await import("../stores/settings");
  await import("./audio");
}, 60000);

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
  Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
    value: vi.fn(async (_sinkId: string) => {}),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
  vi.restoreAllMocks();
});

async function load() {
  const settings = await import("../stores/settings");
  const audio = await import("./audio");
  return { settings: settings.useSettings, audio };
}

function elementSetSink(): ReturnType<typeof vi.fn> {
  return HTMLMediaElement.prototype.setSinkId as unknown as ReturnType<typeof vi.fn>;
}

async function settle(ms = 0) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("equalizer settings", () => {
  it("builds the graph when EQ is switched on and sends each band gain to its filter", async () => {
    const { settings } = await load();
    const gains = [6, 0, 0, 0, 0, 0, 0, 0, 0, -3];

    settings.setState({ eqEnabled: true, eqGains: gains });

    expect(created).toHaveLength(1);
    const bands = created[0].filters.slice(0, 10);
    expect(bands[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(6, 0, 0.02);
    expect(bands[9].gain.setTargetAtTime).toHaveBeenLastCalledWith(-3, 0, 0.02);
  });

  it("feeds both decks through the same ten bands", async () => {
    const { settings, audio } = await load();

    settings.setState({ eqEnabled: true });

    const { ctx, filters } = created[0];
    expect(ctx.createMediaElementSource).toHaveBeenCalledWith(audio.activeDeck());
    expect(ctx.createMediaElementSource).toHaveBeenCalledWith(audio.standbyDeck());
    expect(filters.slice(0, 10).every((band) => band.connect.mock.calls.length > 0)).toBe(true);
  });

  it("keeps the graph and sets the bands to 0 dB when EQ is switched off again", async () => {
    const { settings } = await load();
    settings.setState({ eqEnabled: true, eqGains: [4, ...Array(9).fill(0)] });
    const band = created[0].filters[0];

    settings.setState({ eqEnabled: false });

    expect(created).toHaveLength(1);
    expect(band.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.02);
  });

  it("lowers the pre-gain when auto headroom is on and restores unity when it is off", async () => {
    const { settings } = await load();
    settings.setState({ eqEnabled: true, eqGains: [6, ...Array(9).fill(0)], eqAutoHeadroom: true });
    const [preGain] = created[0].gains;
    const lowered = preGain.gain.setTargetAtTime.mock.calls.at(-1)?.[0];
    expect(lowered).toBeLessThan(1);

    settings.setState({ eqAutoHeadroom: false });

    expect(preGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.05);
  });

  it("resumes a suspended context on the first pointer press", async () => {
    nextState = "suspended";
    const { settings } = await load();
    settings.setState({ eqEnabled: true });
    const { ctx } = created[0];
    expect(ctx.resume).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("pointerdown"));

    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });
});

describe("output device routing", () => {
  it("moves both decks to the pinned device when no EQ graph exists", async () => {
    const { settings } = await load();

    settings.setState({ audioSinkId: "speakers-1" });

    expect(elementSetSink()).toHaveBeenCalledTimes(2);
    expect(elementSetSink()).toHaveBeenCalledWith("speakers-1");
  });

  it("moves the audio context instead of the decks when the graph exists", async () => {
    const { settings } = await load();
    settings.setState({ eqEnabled: true });

    settings.setState({ audioSinkId: "speakers-1" });

    expect(created[0].ctx.setSinkId).toHaveBeenCalledWith("speakers-1");
    expect(elementSetSink()).not.toHaveBeenCalled();
  });

  it("skips a deck that already plays on the target device", async () => {
    const { settings, audio } = await load();
    for (const deck of [audio.activeDeck(), audio.standbyDeck()]) {
      Object.defineProperty(deck, "sinkId", { value: "speakers-1", configurable: true });
    }

    settings.setState({ audioSinkId: "speakers-1" });

    expect(elementSetSink()).not.toHaveBeenCalled();
  });

  it("retries a rejected device once after 300 ms, then falls back to the system default", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    elementSetSink().mockImplementation(async (sinkId: string) => {
      if (sinkId === "gone") throw new Error("NotFoundError");
    });
    const { settings } = await load();

    settings.setState({ audioSinkId: "gone" });
    await settle(400);

    const sinks = elementSetSink().mock.calls.map((call) => call[0]);
    expect(sinks.filter((sink) => sink === "gone")).toHaveLength(4);
    expect(sinks.filter((sink) => sink === "")).toHaveLength(2);
  });

  it("does not retry a rejected system default", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { settings, audio } = await load();
    settings.setState({ audioSinkId: "speakers-1" });
    for (const deck of [audio.activeDeck(), audio.standbyDeck()]) {
      Object.defineProperty(deck, "sinkId", { value: "speakers-1", configurable: true });
    }
    elementSetSink().mockClear();
    elementSetSink().mockRejectedValue(new Error("NotAllowedError"));

    settings.setState({ audioSinkId: "" });
    await settle(400);

    expect(elementSetSink().mock.calls.map((call) => call[0])).toEqual(["", ""]);
  });
});