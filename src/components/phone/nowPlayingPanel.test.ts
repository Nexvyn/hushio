import { describe, expect, it } from "vitest";
import {
  PANEL_FLICK_PX_S,
  hasLyricsText,
  lyricsHintVisible,
  panelGestureMode,
  panelKindAt,
  panelReleaseTarget,
  scrollHoldsDrag,
} from "./nowPlayingPanel";
import type { LyricsResult } from "../../lib/bridge";

describe("panelKindAt", () => {
  it("opens the queue for a start in the right third and lyrics elsewhere", () => {
    expect(panelKindAt(900, 1000)).toBe("queue");
    expect(panelKindAt(666, 1000)).toBe("lyrics");
    expect(panelKindAt(667, 1000)).toBe("queue");
    expect(panelKindAt(500, 1000)).toBe("lyrics");
    expect(panelKindAt(50, 1000)).toBe("lyrics");
  });
});

const synced: LyricsResult = { synced: [{ time: 1, text: "line" }], plain: null, source: "LRCLIB", wordSynced: false };
const plain: LyricsResult = { synced: null, plain: "words", source: "LRCLIB", wordSynced: false };
const blank: LyricsResult = { synced: [], plain: "   ", source: "LRCLIB", wordSynced: false };

describe("panelGestureMode", () => {
  it("opens the lyrics on an upward drag from the player", () => {
    expect(panelGestureMode({ open: false, movedUp: true, held: false })).toBe("panel");
  });

  it("gives a downward drag to the sheet while the panel is closed", () => {
    expect(panelGestureMode({ open: false, movedUp: false, held: false })).toBe("sheet");
  });

  it("drives the open panel on a downward drag that is not in a scrolled list", () => {
    expect(panelGestureMode({ open: true, movedUp: false, held: false })).toBe("panel");
  });

  it("leaves a drag that starts in a scrolled lyrics list to the list", () => {
    expect(panelGestureMode({ open: true, movedUp: false, held: true })).toBe("scroll");
    expect(panelGestureMode({ open: true, movedUp: true, held: true })).toBe("scroll");
  });
});

describe("panelReleaseTarget", () => {
  const base = { progress: 0, start: 0, velocity: 0, startOpen: false };

  it("commits open past 30% of travel", () => {
    expect(panelReleaseTarget({ ...base, progress: 0.31 })).toBe(1);
  });

  it("stays closed under 30% of travel", () => {
    expect(panelReleaseTarget({ ...base, progress: 0.29 })).toBe(0);
  });

  it("commits closed past 30% of travel back", () => {
    expect(panelReleaseTarget({ ...base, start: 1, progress: 0.69, startOpen: true })).toBe(0);
  });

  it("keeps the starting state under 30% of travel", () => {
    expect(panelReleaseTarget({ ...base, start: 1, progress: 0.8, startOpen: true })).toBe(1);
  });

  it("flicks open on an upward release faster than 450 px/s", () => {
    expect(panelReleaseTarget({ ...base, velocity: -PANEL_FLICK_PX_S - 1 })).toBe(1);
  });

  it("flicks closed on a downward release faster than 450 px/s", () => {
    expect(panelReleaseTarget({ ...base, start: 1, progress: 1, velocity: PANEL_FLICK_PX_S + 1, startOpen: true })).toBe(0);
  });

  it("does not flick at exactly 450 px/s", () => {
    expect(panelReleaseTarget({ ...base, velocity: -PANEL_FLICK_PX_S })).toBe(0);
  });
});

describe("scrollHoldsDrag", () => {
  it("holds a drag only when the list is scrolled away from the top", () => {
    expect(scrollHoldsDrag(0)).toBe(false);
    expect(scrollHoldsDrag(120)).toBe(true);
    expect(scrollHoldsDrag(null)).toBe(false);
  });
});

describe("lyrics availability", () => {
  it("counts synced or plain text as lyrics and blank text as none", () => {
    expect(hasLyricsText(synced)).toBe(true);
    expect(hasLyricsText(plain)).toBe(true);
    expect(hasLyricsText(blank)).toBe(false);
    expect(hasLyricsText(null)).toBe(false);
  });

  it("shows the lyrics hint while loading or when lyrics exist", () => {
    expect(lyricsHintVisible({ loading: true, lyrics: null })).toBe(true);
    expect(lyricsHintVisible({ loading: false, lyrics: synced })).toBe(true);
    expect(lyricsHintVisible({ loading: false, lyrics: null })).toBe(false);
  });
});
