import { describe, expect, it } from "vitest";
import {
  expiryOf,
  IDLE_SNAPSHOT,
  isAndroidAgent,
  mediaEventsFor,
  queueItemFor,
  type PlayerSnapshot,
} from "./androidPlayback";

const playing: PlayerSnapshot = { ...IDLE_SNAPSHOT, playing: true, durationMs: 200_000, positionMs: 5_000 };

describe("mediaEventsFor", () => {
  it("reports play and playing when playback starts", () => {
    expect(mediaEventsFor(IDLE_SNAPSHOT, playing)).toEqual(["play", "playing", "durationchange", "timeupdate"]);
  });

  it("reports pause when playback stops", () => {
    expect(mediaEventsFor(playing, { ...playing, playing: false, positionMs: 5_000 })).toEqual(["pause"]);
  });

  it("reports waiting while buffering and playing again after it", () => {
    const buffering = { ...playing, buffering: true };
    expect(mediaEventsFor(playing, buffering)).toEqual(["waiting"]);
    expect(mediaEventsFor(buffering, playing)).toEqual(["playing"]);
  });

  it("reports timeupdate on position or item change only", () => {
    expect(mediaEventsFor(playing, { ...playing, positionMs: 6_000 })).toEqual(["timeupdate"]);
    expect(mediaEventsFor(playing, { ...playing, index: 1 })).toEqual(["timeupdate"]);
    expect(mediaEventsFor(playing, { ...playing })).toEqual([]);
  });

  it("reports durationchange when the duration changes", () => {
    expect(mediaEventsFor(playing, { ...playing, durationMs: 210_000 })).toEqual(["durationchange"]);
  });
});

describe("expiryOf", () => {
  it("reads the expire parameter in seconds", () => {
    expect(expiryOf("https://x.googlevideo.com/videoplayback?expire=1700000000&itag=251", 0)).toBe(1_700_000_000_000);
  });

  it("falls back to ten minutes when the URL has no expiry", () => {
    expect(expiryOf("https://x.googlevideo.com/videoplayback", 1_000)).toBe(1_000 + 10 * 60 * 1000);
  });
});

describe("queueItemFor", () => {
  it("copies the headers so no two items share them", () => {
    const shared = { "User-Agent": "agent" };
    const first = queueItemFor("a", "A", "https://x/a", shared, 1);
    const second = queueItemFor("b", "B", "https://x/b", shared, 2);
    first.headers["Referer"] = "https://example.test";
    expect(second.headers).toEqual({ "User-Agent": "agent" });
    expect(first.headers).not.toBe(second.headers);
  });
});

describe("isAndroidAgent", () => {
  it("detects Android user agents only", () => {
    expect(isAndroidAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(true);
    expect(isAndroidAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});
