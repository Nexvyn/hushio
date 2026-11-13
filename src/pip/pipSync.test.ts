import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => {
  const handlers: { command?: (payload: unknown) => void; open?: (open: boolean) => void; needState?: () => void } = {};
  return {
    handlers,
    pipSendState: vi.fn(async () => {}),
    pipIsOpen: vi.fn(async () => false),
    listenPipOpenChanged: vi.fn(async (fn: (open: boolean) => void) => {
      handlers.open = fn;
      return () => {};
    }),
    listenPipNeedState: vi.fn(async (fn: () => void) => {
      handlers.needState = fn;
      return () => {};
    }),
    listenPipCommand: vi.fn(async (fn: (payload: unknown) => void) => {
      handlers.command = fn;
      return () => {};
    }),
    persistRead: vi.fn(async () => null),
    persistWrite: vi.fn(async () => true),
  };
});

vi.mock("../lib/bridge", () => bridge);

vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import type { PipSnapshot } from "./types";
import {
  buildSnapshot,
  createPipSync,
  executePipCommand,
  parsePipCommand,
  startPipSync,
} from "./pipSync";

const track = { id: "a", title: "Song A", artist: "Artist A", thumb: null };
const snapshot = (overrides: Partial<PipSnapshot> = {}): PipSnapshot => ({
  track: { id: "a", title: "Song A", artist: "Artist A", album: "", thumb: "" },
  playing: true,
  buffering: false,
  position: 1,
  duration: 200,
  volume: 0.5,
  muted: false,
  shuffle: false,
  repeat: "off",
  liked: false,
  ...overrides,
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("buildSnapshot", () => {
  beforeEach(() => {
    usePlayer.setState({ queue: [track], index: 0, playing: true, position: 12, duration: 200, volume: 0.4 });
  });

  it("copies the album of the current track into the snapshot", () => {
    usePlayer.setState({ queue: [{ ...track, album: "Album A" }], index: 0 });
    expect(buildSnapshot(usePlayer.getState(), []).track).toMatchObject({ album: "Album A" });
  });

  it("copies the player fields and the current track", () => {
    const built = buildSnapshot(usePlayer.getState(), []);
    expect(built).toMatchObject({
      track: { id: "a", title: "Song A", artist: "Artist A", album: "", thumb: "" },
      playing: true,
      position: 12,
      duration: 200,
      volume: 0.4,
      liked: false,
    });
  });

  it("marks the track liked when the library holds it", () => {
    expect(buildSnapshot(usePlayer.getState(), [{ id: "a" }]).liked).toBe(true);
    expect(buildSnapshot(usePlayer.getState(), [{ id: "other" }]).liked).toBe(false);
  });

  it("reports no track and not liked when nothing is queued", () => {
    usePlayer.setState({ queue: [], index: 0 });
    expect(buildSnapshot(usePlayer.getState(), [{ id: "a" }])).toMatchObject({ track: null, liked: false });
  });
});

describe("parsePipCommand", () => {
  it("accepts the transport commands", () => {
    expect(parsePipCommand({ type: "toggle" })).toEqual({ type: "toggle" });
    expect(parsePipCommand({ type: "like" })).toEqual({ type: "like" });
    expect(parsePipCommand({ type: "seek", sec: 30 })).toEqual({ type: "seek", sec: 30 });
  });

  it("clamps the volume to 0..1", () => {
    expect(parsePipCommand({ type: "volume", v: 2 })).toEqual({ type: "volume", v: 1 });
    expect(parsePipCommand({ type: "volume", v: -1 })).toEqual({ type: "volume", v: 0 });
  });

  it("rejects unknown, malformed and non-finite commands", () => {
    expect(parsePipCommand({ type: "explode" })).toBeNull();
    expect(parsePipCommand({ type: "seek", sec: Number.NaN })).toBeNull();
    expect(parsePipCommand({ type: "volume" })).toBeNull();
    expect(parsePipCommand({ type: "open", to: "album" })).toBeNull();
    expect(parsePipCommand("toggle")).toBeNull();
    expect(parsePipCommand(null)).toBeNull();
  });
});

describe("createPipSync", () => {
  it("sends nothing while the PiP window is closed", () => {
    const send = vi.fn(async () => {});
    const sync = createPipSync(() => snapshot(), send);
    sync.push();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a forced snapshot when it opens and then only changes", () => {
    let current = snapshot();
    const send = vi.fn(async () => {});
    const sync = createPipSync(() => current, send);
    sync.setOpen(true);
    expect(send).toHaveBeenCalledTimes(1);
    sync.push();
    expect(send).toHaveBeenCalledTimes(1);
    current = snapshot({ position: 2 });
    sync.push();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(snapshot({ position: 2 }));
  });

  it("stops sending after it closes and resends on reopen", () => {
    const send = vi.fn(async () => {});
    const sync = createPipSync(() => snapshot(), send);
    sync.setOpen(true);
    sync.setOpen(false);
    sync.push();
    expect(send).toHaveBeenCalledTimes(1);
    sync.setOpen(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("executePipCommand", () => {
  let stubs: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    stubs = {
      toggle: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      toggleMute: vi.fn(),
      toggleShuffle: vi.fn(),
      cycleRepeat: vi.fn(),
    };
    usePlayer.setState({ ...stubs, queue: [track], index: 0 });
  });

  it("routes transport commands to the player store", () => {
    executePipCommand({ type: "toggle" });
    executePipCommand({ type: "next" });
    executePipCommand({ type: "seek", sec: 42 });
    executePipCommand({ type: "volume", v: 0.3 });
    executePipCommand({ type: "shuffle" });
    expect(stubs.toggle).toHaveBeenCalledTimes(1);
    expect(stubs.next).toHaveBeenCalledWith(true);
    expect(stubs.seek).toHaveBeenCalledWith(42);
    expect(stubs.setVolume).toHaveBeenCalledWith(0.3);
    expect(stubs.toggleShuffle).toHaveBeenCalledTimes(1);
  });

  it("likes the current track through the library store", () => {
    const toggleLike = vi.fn();
    useLibrary.setState({ toggleLike });
    executePipCommand({ type: "like" });
    expect(toggleLike).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("does nothing to the library when no track is queued", () => {
    const toggleLike = vi.fn();
    useLibrary.setState({ toggleLike });
    usePlayer.setState({ queue: [], index: 0 });
    executePipCommand({ type: "like" });
    expect(toggleLike).not.toHaveBeenCalled();
  });
});

describe("startPipSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.pipIsOpen.mockResolvedValue(false);
  });

  it("applies commands that arrive from the PiP window", async () => {
    const toggle = vi.fn();
    usePlayer.setState({ toggle });
    const detach = startPipSync();
    await flush();
    bridge.handlers.command?.({ type: "toggle" });
    bridge.handlers.command?.({ type: "explode" });
    expect(toggle).toHaveBeenCalledTimes(1);
    detach();
  });

  it("opens the mirror when the PiP window asks for state", async () => {
    const detach = startPipSync();
    await flush();
    bridge.handlers.needState?.();
    expect(bridge.pipSendState).toHaveBeenCalledTimes(1);
    detach();
  });

  it("opens the mirror right away when the PiP window is already open", async () => {
    bridge.pipIsOpen.mockResolvedValue(true);
    const detach = startPipSync();
    await flush();
    expect(bridge.pipSendState).toHaveBeenCalledTimes(1);
    detach();
  });
});
