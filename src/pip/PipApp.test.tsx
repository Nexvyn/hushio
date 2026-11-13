import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const bridge = vi.hoisted(() => {
  const handlers: { state?: (snapshot: unknown) => void; erased?: () => void } = {};
  return {
    handlers,
    pipReady: vi.fn(async () => {}),
    pipClose: vi.fn(async () => {}),
    pipMinimize: vi.fn(async () => {}),
    pipShowMain: vi.fn(async () => {}),
    pipSendCommand: vi.fn(async () => {}),
    pipSetCompact: vi.fn(async () => {}),
    listenPipState: vi.fn(async (fn: (snapshot: unknown) => void) => {
      handlers.state = fn;
      return () => {};
    }),
    listenSessionErased: vi.fn(async (fn: () => void) => {
      handlers.erased = fn;
      return () => {};
    }),
    persistRead: vi.fn(async () => null),
    persistWrite: vi.fn(async () => true),
  };
});

vi.mock("../lib/bridge", () => bridge);

import { PipApp } from "./PipApp";
import type { PipSnapshot } from "./types";

const playing = (overrides: Partial<PipSnapshot> = {}): PipSnapshot => ({
  track: { id: "a", title: "Song A", artist: "Artist A", album: "", thumb: "" },
  playing: true,
  buffering: false,
  position: 30,
  duration: 200,
  volume: 0.5,
  muted: false,
  shuffle: false,
  repeat: "off",
  liked: false,
  ...overrides,
});

async function mirror(snapshot: PipSnapshot) {
  await act(async () => {
    bridge.handlers.state?.(snapshot);
  });
}

describe("PipApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("asks the main window for state once its listeners are ready", async () => {
    render(<PipApp />);
    await act(async () => {});
    expect(bridge.pipReady).toHaveBeenCalledTimes(1);
    expect(bridge.listenPipState).toHaveBeenCalled();
  });

  it("shows the mirrored track and artist", async () => {
    render(<PipApp />);
    await mirror(playing());
    expect(screen.getByText("Song A")).toBeTruthy();
    expect(screen.getByText("Artist A")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("says nothing is playing when the snapshot has no track", async () => {
    render(<PipApp />);
    await mirror(playing({ track: null, playing: false }));
    expect(screen.getByText("Nothing playing")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the play button as a toggle command", async () => {
    render(<PipApp />);
    await mirror(playing({ playing: false }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(bridge.pipSendCommand).toHaveBeenCalledWith({ type: "toggle" });
  });

  it("sends transport and like clicks as commands", async () => {
    render(<PipApp />);
    await mirror(playing());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Liked" }));
    expect(bridge.pipSendCommand).toHaveBeenCalledWith({ type: "next" });
    expect(bridge.pipSendCommand).toHaveBeenCalledWith({ type: "like" });
  });

  it("maps Space and the arrows to playback commands", async () => {
    render(<PipApp />);
    await mirror(playing({ position: 30, volume: 0.5 }));
    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.keyDown(window, { code: "ArrowRight" });
    fireEvent.keyDown(window, { code: "ArrowLeft" });
    fireEvent.keyDown(window, { code: "ArrowUp" });
    fireEvent.keyDown(window, { code: "ArrowRight", shiftKey: true });
    expect(bridge.pipSendCommand).toHaveBeenCalledWith({ type: "toggle" });
    expect(bridge.pipSendCommand).toHaveBeenCalledWith({ type: "seek", sec: 35 });
    expect(bridge.pipSendCommand).toHaveBeenCalledWith({ type: "seek", sec: 25 });
    expect(bridge.pipSendCommand).toHaveBeenCalledWith({ type: "volume", v: 0.55 });
    expect(bridge.pipSendCommand).toHaveBeenCalledWith({ type: "next" });
  });

  it("ignores shortcuts that use Ctrl, Meta or Alt", async () => {
    render(<PipApp />);
    await mirror(playing());
    fireEvent.keyDown(window, { code: "KeyM", ctrlKey: true });
    fireEvent.keyDown(window, { code: "KeyS", altKey: true });
    expect(bridge.pipSendCommand).not.toHaveBeenCalled();
  });

  it("sends mute, shuffle and repeat from their keys", async () => {
    render(<PipApp />);
    await mirror(playing());
    fireEvent.keyDown(window, { code: "KeyM" });
    fireEvent.keyDown(window, { code: "KeyS" });
    fireEvent.keyDown(window, { code: "KeyR" });
    expect(bridge.pipSendCommand).toHaveBeenNthCalledWith(1, { type: "mute" });
    expect(bridge.pipSendCommand).toHaveBeenNthCalledWith(2, { type: "shuffle" });
    expect(bridge.pipSendCommand).toHaveBeenNthCalledWith(3, { type: "repeat" });
  });

  it("closes itself when the session is erased", async () => {
    render(<PipApp />);
    await act(async () => {
      bridge.handlers.erased?.();
    });
    expect(bridge.pipClose).toHaveBeenCalledTimes(1);
  });

  it("toggles the compact bar and closes or minimizes from the top bar", async () => {
    render(<PipApp />);
    await mirror(playing());
    fireEvent.click(screen.getByRole("button", { name: "Compact mini player" }));
    expect(bridge.pipSetCompact).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.click(screen.getByRole("button", { name: "Close mini player" }));
    expect(bridge.pipMinimize).toHaveBeenCalledTimes(1);
    expect(bridge.pipClose).toHaveBeenCalledTimes(1);
  });
});
