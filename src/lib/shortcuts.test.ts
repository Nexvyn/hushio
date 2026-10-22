import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

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

vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { useKeyboardShortcuts } from "./shortcuts";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: "Artist", thumb: null });
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();

function press(code: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", { code, key: "", bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function startPlaying(count = 3, index = 0) {
  usePlayer.getState().playQueue(Array.from({ length: count }, (_, i) => track(i)), index);
}

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useUI.setState(initialUI, true);
  renderHook(() => useKeyboardShortcuts());
});

afterEach(() => {
  cleanup();
});

describe("playback keys", () => {
  it("Space plays or pauses and prevents the default action", () => {
    startPlaying();
    const event = press("Space");

    expect(event.defaultPrevented).toBe(true);
    expect(usePlayer.getState().playing).toBe(false);
    expect(pause).toHaveBeenCalled();
  });

  it("Left and Right seek five seconds", () => {
    startPlaying();
    usePlayer.setState({ position: 20 });

    press("ArrowRight");
    expect(seekTo).toHaveBeenLastCalledWith(25);

    usePlayer.setState({ position: 20 });
    press("ArrowLeft");
    expect(seekTo).toHaveBeenLastCalledWith(15);
  });

  it("holding an arrow key keeps seeking", () => {
    startPlaying();
    usePlayer.setState({ position: 0 });
    press("ArrowRight", { repeat: true });
    expect(seekTo).toHaveBeenCalledWith(5);
  });

  it("Shift with Left and Right goes to the previous and next song", () => {
    startPlaying(3, 1);
    press("ArrowRight", { shiftKey: true });
    expect(usePlayer.getState().index).toBe(2);

    press("ArrowLeft", { shiftKey: true });
    press("ArrowLeft", { shiftKey: true });
    expect(usePlayer.getState().index).toBe(0);
  });

  it("Up and Down change the volume by 0.05", () => {
    startPlaying();
    usePlayer.setState({ volume: 0.5 });

    press("ArrowUp");
    expect(usePlayer.getState().volume).toBeCloseTo(0.55);

    press("ArrowDown");
    press("ArrowDown");
    expect(usePlayer.getState().volume).toBeCloseTo(0.45);
  });

  it("M mutes and unmutes", () => {
    press("KeyM");
    expect(setMuted).toHaveBeenLastCalledWith(true);
    expect(usePlayer.getState().muted).toBe(true);
  });

  it("S toggles shuffle and R cycles repeat", () => {
    startPlaying();
    press("KeyS");
    expect(usePlayer.getState().shuffle).toBe(true);

    press("KeyR");
    expect(usePlayer.getState().repeat).toBe("all");
  });

  it("Q, L and N open the queue, lyrics and Now Playing", () => {
    press("KeyQ");
    expect(useUI.getState().rightPanel).toBe("queue");

    press("KeyQ");
    expect(useUI.getState().rightPanel).toBe("details");

    press("KeyL");
    expect(useUI.getState().lyricsCenter).toBe(true);

    press("KeyN");
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("Space does not repeat while held", () => {
    startPlaying();
    press("Space", { repeat: true });
    expect(usePlayer.getState().playing).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });

  it("leaves Alt with arrows to history navigation", () => {
    startPlaying();
    usePlayer.setState({ position: 20 });
    press("ArrowRight", { altKey: true });
    expect(seekTo).not.toHaveBeenCalled();
  });

  it("does nothing for Ctrl with a playback key", () => {
    startPlaying();
    press("Space", { ctrlKey: true });
    expect(usePlayer.getState().playing).toBe(true);
  });
});

describe("typing and layers", () => {
  it("does not fire while typing in a text field", () => {
    startPlaying();
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);

    const event = press("Space", {}, input);
    press("KeyM", {}, input);
    press("ArrowRight", {}, input);
    input.remove();

    expect(event.defaultPrevented).toBe(false);
    expect(usePlayer.getState().playing).toBe(true);
    expect(setMuted).not.toHaveBeenCalled();
    expect(seekTo).not.toHaveBeenCalled();
  });

  it("does not fire while typing in a text area", () => {
    startPlaying();
    const area = document.createElement("textarea");
    document.body.appendChild(area);

    press("Space", {}, area);
    area.remove();

    expect(usePlayer.getState().playing).toBe(true);
  });

  it("still fires while a slider has focus", () => {
    startPlaying();
    const slider = document.createElement("input");
    slider.type = "range";
    document.body.appendChild(slider);

    press("ArrowUp", {}, slider);
    slider.remove();

    expect(usePlayer.getState().volume).toBeCloseTo(0.85);
  });

  it("does nothing while a dialog is open", () => {
    startPlaying();
    useUI.setState({ dialog: { title: "Confirm", onConfirm: () => {} } });
    press("Space");

    expect(usePlayer.getState().playing).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });
});
