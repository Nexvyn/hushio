import { describe, expect, it } from "vitest";
import { streamBitrate, DATA_SAVER_KBPS } from "./streamingQuality";

describe("streamBitrate", () => {
  it("gives the lowest quality for the lowest setting", () => {
    expect(streamBitrate("low", false)).toBe(48);
  });

  it("leaves the best quality unbounded", () => {
    expect(streamBitrate("lossless", false)).toBeUndefined();
  });

  it("forces the lowest bitrate when the data saver is on", () => {
    expect(streamBitrate("lossless", true)).toBe(DATA_SAVER_KBPS);
    expect(streamBitrate("high", true)).toBe(DATA_SAVER_KBPS);
  });
});
