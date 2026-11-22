import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXCLUSIVE_UNAVAILABLE } from "./exclusive";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
const state = vi.hoisted(() => ({ controlFails: false, loadFailures: 0 }));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: core.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const { NativeAudioDeck, onExclusiveRejected } = await import("./nativeAudioDeck");

const rejected = vi.fn();
onExclusiveRejected(rejected);

const snapshot = { timePos: 0, duration: 200, paused: true, idle: false, eof: false, volume: 100, speed: 1 };

core.invoke.mockImplementation(async (command: string, args?: { control?: { kind: string } }) => {
  if (command === "desktop_playback_available") return true;
  if (command === "desktop_playback_load") {
    if (state.loadFailures > 0) {
      state.loadFailures -= 1;
      throw EXCLUSIVE_UNAVAILABLE;
    }
    return snapshot;
  }
  if (command === "desktop_playback_control" && state.controlFails && args?.control?.kind === "exclusive") {
    throw EXCLUSIVE_UNAVAILABLE;
  }
  return undefined;
});

function controlsSent(): { kind: string; enabled?: boolean }[] {
  return core.invoke.mock.calls
    .filter(([command]) => command === "desktop_playback_control")
    .map(([, args]) => (args as { control: { kind: string; enabled?: boolean } }).control);
}

beforeEach(() => {
  core.invoke.mockClear();
  rejected.mockClear();
  state.controlFails = false;
  state.loadFailures = 0;
});

describe("exclusive output on the native deck", () => {
  it("sends the exclusive control to a loaded deck", async () => {
    const deck = new NativeAudioDeck(0);
    await deck.loadSource("local:track");
    deck.setExclusive(true);
    await vi.waitFor(() =>
      expect(core.invoke).toHaveBeenCalledWith("desktop_playback_control", {
        deck: 0,
        generation: 1,
        control: { kind: "exclusive", enabled: true },
      }),
    );
    expect(rejected).not.toHaveBeenCalled();
  });

  it("holds the flag until a source loads, then sends it with the load", async () => {
    const deck = new NativeAudioDeck(1);
    deck.setExclusive(true);
    expect(controlsSent()).toEqual([]);
    await deck.loadSource("local:track");
    expect(controlsSent()).toContainEqual({ kind: "exclusive", enabled: true });
  });

  it("sends nothing exclusive by default", async () => {
    const deck = new NativeAudioDeck(0);
    await deck.loadSource("local:track");
    expect(controlsSent().some((control) => control.kind === "exclusive")).toBe(false);
  });

  it("reports the refusal through the handler when mpv rejects the control", async () => {
    state.controlFails = true;
    const deck = new NativeAudioDeck(0);
    await deck.loadSource("local:track");
    deck.setExclusive(true);
    await vi.waitFor(() => expect(rejected).toHaveBeenCalledTimes(1));
  });

  it("loads the source again without exclusive output when the load is refused", async () => {
    state.loadFailures = 1;
    const deck = new NativeAudioDeck(0);
    deck.setExclusive(true);
    await deck.loadSource("local:track");
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(deck.duration).toBe(200);
    expect(controlsSent().some((control) => control.kind === "exclusive")).toBe(false);
  });
});
