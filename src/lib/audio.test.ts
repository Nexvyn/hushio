import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerStreamUrl, streamProxyPort, resolveStream } = vi.hoisted(() => ({
  registerStreamUrl: vi.fn(),
  streamProxyPort: vi.fn(),
  resolveStream: vi.fn(),
}));

vi.mock("./bridge", () => ({ registerStreamUrl, streamProxyPort }));
vi.mock("./resolveStream", () => ({ resolveStream }));

import { audio, playStream, seekTo, TEST_SONG_ID } from "./audio";

const STREAM_URL = "https://r1---sn-test.googlevideo.com/videoplayback?itag=251";

function setMediaTimes(duration: number, currentTime = 0) {
  Object.defineProperty(audio, "duration", { value: duration, configurable: true });
  Object.defineProperty(audio, "currentTime", {
    value: currentTime,
    writable: true,
    configurable: true,
  });
}

const play = vi.spyOn(HTMLMediaElement.prototype, "play");

describe("playStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    play.mockResolvedValue(undefined);
    resolveStream.mockResolvedValue({ url: STREAM_URL, mime: "audio/webm", lufs: null });
    streamProxyPort.mockResolvedValue(4321);
    registerStreamUrl.mockResolvedValue(undefined);
  });

  it("resolves the test song, registers its URL and plays it through the proxy", async () => {
    await playStream(TEST_SONG_ID);

    expect(resolveStream).toHaveBeenCalledWith(TEST_SONG_ID);
    expect(registerStreamUrl).toHaveBeenCalledWith(TEST_SONG_ID, STREAM_URL);
    expect(audio.src).toBe(`http://127.0.0.1:4321/?id=${TEST_SONG_ID}`);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not register or play when the song cannot be resolved", async () => {
    resolveStream.mockRejectedValue(new Error("No Piped mirror had a playable stream"));

    await expect(playStream(TEST_SONG_ID)).rejects.toThrow("No Piped mirror had a playable stream");
    expect(registerStreamUrl).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
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
