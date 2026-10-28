import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("./audio", () => ({
  audio,
  playStream,
  play,
  pause,
  seekTo,
  setVolume,
  setMuted,
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

const storage = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => storage.value,
    setItem: async (_name: string, value: unknown) => {
      storage.value = value;
    },
    removeItem: async () => {
      storage.value = null;
    },
  }),
}));

import {
  effectiveLyricsOffset,
  lyricsKeyStep,
  useLyricsOffset,
  useLyricsTimingKeys,
} from "./lyricsOffset";
import { LYRICS_NUDGE_STEP, useLyricsNudge } from "../stores/lyricsNudge";
import { useSettings } from "../stores/settings";

function press(code: string, target: Element | Window = window) {
  return fireEvent.keyDown(target, { code });
}

describe("effectiveLyricsOffset", () => {
  it.each([
    [0.25, 1, 1.25],
    [-0.25, 0.05, -0.2],
    [0.1, 0.2, 0.3],
    [0, 0, 0],
  ])("adds nudge %d and device %d to %d", (nudge, device, total) => {
    expect(effectiveLyricsOffset(nudge, device)).toBe(total);
  });
});

describe("device offset setting", () => {
  beforeEach(() => {
    useSettings.setState({ lyricsOffset: 0 });
  });

  it("clamps to plus or minus three seconds", () => {
    useSettings.getState().setLyricsOffset(4);
    expect(useSettings.getState().lyricsOffset).toBe(3);
    useSettings.getState().setLyricsOffset(-3.4);
    expect(useSettings.getState().lyricsOffset).toBe(-3);
  });

  it("rounds to 0.05 seconds", () => {
    useSettings.getState().setLyricsOffset(0.123);
    expect(useSettings.getState().lyricsOffset).toBe(0.1);
    useSettings.getState().setLyricsOffset(0.13);
    expect(useSettings.getState().lyricsOffset).toBe(0.15);
  });
});

describe("useLyricsOffset", () => {
  beforeEach(() => {
    useLyricsNudge.setState({ nudges: {} });
    useSettings.setState({ lyricsOffset: 1 });
  });

  afterEach(() => {
    cleanup();
  });

  it("adds the song's nudge to the device offset", () => {
    useLyricsNudge.setState({ nudges: { a: 0.25 } });
    const { result } = renderHook(() => useLyricsOffset("a"));
    expect(result.current).toBe(1.25);
  });

  it("uses only the device offset for a song without a nudge", () => {
    useLyricsNudge.setState({ nudges: { a: 0.25 } });
    const { result } = renderHook(() => useLyricsOffset("b"));
    expect(result.current).toBe(1);
  });

  it("follows a nudge made while mounted", () => {
    const { result } = renderHook(() => useLyricsOffset("a"));
    act(() => {
      useLyricsNudge.getState().nudge("a", -LYRICS_NUDGE_STEP);
    });
    expect(result.current).toBe(0.75);
  });

  it("returns the device offset when no song is playing", () => {
    const { result } = renderHook(() => useLyricsOffset(null));
    expect(result.current).toBe(1);
  });
});

describe("lyrics timing keys", () => {
  beforeEach(() => {
    useLyricsNudge.setState({ nudges: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it("maps the bracket keys to a quarter second step", () => {
    expect(lyricsKeyStep("BracketLeft")).toBe(-0.25);
    expect(lyricsKeyStep("BracketRight")).toBe(0.25);
    expect(lyricsKeyStep("KeyA")).toBe(0);
  });

  it("moves the song later with ] and earlier with [", () => {
    renderHook(() => useLyricsTimingKeys("a"));
    press("BracketRight");
    press("BracketRight");
    expect(useLyricsNudge.getState().nudges.a).toBe(0.5);
    press("BracketLeft");
    press("BracketLeft");
    press("BracketLeft");
    expect(useLyricsNudge.getState().nudges.a).toBe(-0.25);
  });

  it("keeps each song's change when the song changes", () => {
    const { rerender } = renderHook(({ id }) => useLyricsTimingKeys(id), { initialProps: { id: "a" } });
    press("BracketRight");
    rerender({ id: "b" });
    press("BracketLeft");
    expect(useLyricsNudge.getState().nudges).toEqual({ a: 0.25, b: -0.25 });
  });

  it("stores the change in the device's nudge memory", () => {
    renderHook(() => useLyricsTimingKeys("a"));
    press("BracketRight");
    const stored = storage.value as { state: { nudges: Record<string, number> } };
    expect(stored.state.nudges.a).toBe(0.25);
  });

  it("prevents the browser's default for the bracket keys", () => {
    renderHook(() => useLyricsTimingKeys("a"));
    expect(press("BracketRight")).toBe(false);
    expect(press("KeyA")).toBe(true);
  });

  it("ignores the keys while typing in a text field", () => {
    renderHook(() => useLyricsTimingKeys("a"));
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);
    press("BracketRight", input);
    input.remove();
    expect(useLyricsNudge.getState().nudges).toEqual({});
  });

  it("does nothing when disabled or without a song", () => {
    renderHook(() => useLyricsTimingKeys("a", false));
    renderHook(() => useLyricsTimingKeys(null));
    press("BracketRight");
    expect(useLyricsNudge.getState().nudges).toEqual({});
  });

  it("stops listening after unmount", () => {
    const { unmount } = renderHook(() => useLyricsTimingKeys("a"));
    unmount();
    press("BracketRight");
    expect(useLyricsNudge.getState().nudges).toEqual({});
  });
});
