import { describe, expect, it } from "vitest";
import { GAPLESS_LEAD_S, gaplessEligible, gaplessNextIndex, keepsPrepared, shouldPrepareGapless } from "./gapless";

describe("gaplessEligible", () => {
  const on = { enabled: true, crossfadeSeconds: 0, smartFade: false, exclusive: false };

  it("is on for the default settings", () => {
    expect(gaplessEligible(on)).toBe(true);
  });

  it("is off when the setting is off", () => {
    expect(gaplessEligible({ ...on, enabled: false })).toBe(false);
  });

  it("is off while crossfade is greater than 0", () => {
    expect(gaplessEligible({ ...on, crossfadeSeconds: 4 })).toBe(false);
  });

  it("is off while Automix is on", () => {
    expect(gaplessEligible({ ...on, smartFade: true })).toBe(false);
  });

  it("is off while exclusive output is active", () => {
    expect(gaplessEligible({ ...on, exclusive: true })).toBe(false);
  });
});

describe("shouldPrepareGapless", () => {
  it("prepares the next song once the lead window is reached", () => {
    expect(shouldPrepareGapless(GAPLESS_LEAD_S + 0.5, 200)).toBe(false);
    expect(shouldPrepareGapless(GAPLESS_LEAD_S, 200)).toBe(true);
    expect(shouldPrepareGapless(3, 200)).toBe(true);
  });

  it("prepares a song shorter than the lead window straight away", () => {
    expect(shouldPrepareGapless(5, 5)).toBe(true);
  });

  it("does nothing while the duration is unknown", () => {
    expect(shouldPrepareGapless(1, Number.NaN)).toBe(false);
    expect(shouldPrepareGapless(1, 0)).toBe(false);
  });
});

describe("gaplessNextIndex", () => {
  it("repeats the same track with repeat one", () => {
    expect(gaplessNextIndex(3, 1, "one", false)).toBe(1);
    expect(gaplessNextIndex(3, 2, "one", true)).toBe(2);
  });

  it("moves to the following item in the middle of the queue", () => {
    expect(gaplessNextIndex(3, 0, "off", false)).toBe(1);
    expect(gaplessNextIndex(3, 1, "all", true)).toBe(2);
  });

  it("wraps to the start with repeat all when not shuffling", () => {
    expect(gaplessNextIndex(3, 2, "all", false)).toBe(0);
  });

  it("has no next item at the end of the queue otherwise", () => {
    expect(gaplessNextIndex(3, 2, "off", false)).toBe(-1);
    expect(gaplessNextIndex(3, 2, "all", true)).toBe(-1);
  });
});

describe("keepsPrepared", () => {
  const prepared = { fromId: "a", toId: "b" };

  it("keeps a prepared song while the queue still has the same current and next song", () => {
    expect(keepsPrepared(prepared, "a", "b", true)).toBe(true);
  });

  it("discards it when the next song changed, such as after a queue or shuffle change", () => {
    expect(keepsPrepared(prepared, "a", "c", true)).toBe(false);
  });

  it("discards it when the current song changed", () => {
    expect(keepsPrepared(prepared, "x", "b", true)).toBe(false);
  });

  it("discards it when there is no next song", () => {
    expect(keepsPrepared(prepared, "a", undefined, true)).toBe(false);
  });

  it("discards it when gapless is no longer eligible", () => {
    expect(keepsPrepared(prepared, "a", "b", false)).toBe(false);
  });
});
