import { describe, expect, it } from "vitest";
import { clipDeckTime, clipDuration, clipEnded, clipFrom, clipPosition, isCueTrackId } from "./clip";

const CLIP = { start: 100, end: 200 };

describe("isCueTrackId", () => {
  it("matches only the ids of cue tracks", () => {
    expect(isCueTrackId("local:0123456789abcdef-01")).toBe(true);
    expect(isCueTrackId("local:0123456789abcdef-12")).toBe(true);
    expect(isCueTrackId("local:0123456789abcdef")).toBe(false);
    expect(isCueTrackId("local:abc-01")).toBe(false);
    expect(isCueTrackId("net:0123456789abcdef-01")).toBe(false);
    expect(isCueTrackId(undefined)).toBe(false);
  });
});

describe("clipFrom", () => {
  it("needs both edges and an end after the start", () => {
    expect(clipFrom(undefined, 200)).toBeUndefined();
    expect(clipFrom(100, undefined)).toBeUndefined();
    expect(clipFrom(200, 100)).toBeUndefined();
    expect(clipFrom(Number.NaN, 100)).toBeUndefined();
    expect(clipFrom(100, 200)).toEqual(CLIP);
  });
});

describe("clipPosition", () => {
  it("reports time from the clip start and clamps to the clip", () => {
    expect(clipPosition(100, CLIP)).toBe(0);
    expect(clipPosition(150, CLIP)).toBe(50);
    expect(clipPosition(90, CLIP)).toBe(0);
    expect(clipPosition(250, CLIP)).toBe(100);
    expect(clipPosition(Number.NaN, CLIP)).toBe(0);
  });

  it("returns the deck time unchanged for a whole file", () => {
    expect(clipPosition(42, null)).toBe(42);
    expect(clipPosition(42, undefined)).toBe(42);
  });
});

describe("clipDeckTime", () => {
  it("maps a position inside the clip to the file time and clamps it", () => {
    expect(clipDeckTime(0, CLIP)).toBe(100);
    expect(clipDeckTime(30, CLIP)).toBe(130);
    expect(clipDeckTime(-5, CLIP)).toBe(100);
    expect(clipDeckTime(500, CLIP)).toBe(200);
    expect(clipDeckTime(Number.NaN, CLIP)).toBe(100);
  });

  it("returns the position unchanged for a whole file", () => {
    expect(clipDeckTime(30, null)).toBe(30);
  });
});

describe("clipDuration", () => {
  it("is the clip length, or the deck duration for a whole file", () => {
    expect(clipDuration(900, CLIP)).toBe(100);
    expect(clipDuration(900, null)).toBe(900);
  });
});

describe("clipEnded", () => {
  it("is true from the clip end, with a small tolerance", () => {
    expect(clipEnded(199.9, CLIP)).toBe(false);
    expect(clipEnded(199.96, CLIP)).toBe(true);
    expect(clipEnded(230, CLIP)).toBe(true);
    expect(clipEnded(Number.NaN, CLIP)).toBe(false);
  });

  it("is never true for a whole file", () => {
    expect(clipEnded(10_000, null)).toBe(false);
  });
});
