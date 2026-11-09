import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  take: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  dropPaths: vi.fn(),
  playerSetQueue: vi.fn(() => Promise.resolve({ accepted: 1 })),
  playerPlay: vi.fn(() => Promise.resolve()),
  playerTakeLaunch: vi.fn(() => Promise.resolve({} as Record<string, string>)),
  listenPlayerEvent: vi.fn(() => Promise.resolve(() => {})),
  platform: "windows",
  playTrack: vi.fn(),
}));

vi.mock("./bridge", () => ({
  launchTake: hoisted.take,
  listenLaunchPending: hoisted.listen,
  listenPlayerEvent: hoisted.listenPlayerEvent,
  playerSetQueue: hoisted.playerSetQueue,
  playerPlay: hoisted.playerPlay,
  playerTakeLaunch: hoisted.playerTakeLaunch,
  get platform() {
    return hoisted.platform;
  },
}));
vi.mock("./localDrop", () => ({ dropPaths: hoisted.dropPaths }));
vi.mock("../stores/player", () => ({ usePlayer: { getState: () => ({ playTrack: hoisted.playTrack }) } }));

import { playlistBrowseId, routeLaunchAction, routeLaunchTarget, startLaunchActions } from "./launch";
import { useNavigation } from "../stores/navigation";

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.platform = "windows";
  hoisted.take.mockResolvedValue([]);
  hoisted.listen.mockResolvedValue(hoisted.unlisten);
  hoisted.dropPaths.mockResolvedValue(undefined);
  hoisted.playerTakeLaunch.mockResolvedValue({});
  hoisted.listenPlayerEvent.mockResolvedValue(hoisted.unlisten);
  useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
});

describe("launch actions", () => {
  it("adds the VL prefix to a playlist id once", () => {
    expect(playlistBrowseId("PL123")).toBe("VLPL123");
    expect(playlistBrowseId("VLPL123")).toBe("VLPL123");
  });

  it("plays a file action through the local file path", async () => {
    await routeLaunchAction({ type: "file", path: "C:\Music\a.mp3" });
    expect(hoisted.dropPaths).toHaveBeenCalledWith(["C:\Music\a.mp3"]);
    expect(useNavigation.getState().view).toEqual({ name: "home" });
  });

  it("opens a playlist action in the YouTube playlist view", async () => {
    await routeLaunchAction({ type: "playlist", id: "PL123" });
    expect(useNavigation.getState().view).toEqual({ name: "ytplaylist", param: "VLPL123" });
    expect(hoisted.dropPaths).not.toHaveBeenCalled();
  });

  it("takes pending actions on start and routes each one", async () => {
    hoisted.take.mockResolvedValue([
      { type: "file", path: "C:\a.mp3" },
      { type: "playlist", id: "PL9" },
    ]);
    const stop = startLaunchActions();
    await flush();
    expect(hoisted.dropPaths).toHaveBeenCalledWith(["C:\a.mp3"]);
    expect(useNavigation.getState().view).toEqual({ name: "ytplaylist", param: "VLPL9" });
    stop();
  });

  it("takes pending actions again when the app is poked", async () => {
    const stop = startLaunchActions();
    await flush();
    expect(hoisted.take).toHaveBeenCalledTimes(1);
    hoisted.take.mockResolvedValue([{ type: "file", path: "C:\b.flac" }]);
    const onPending = hoisted.listen.mock.calls[0][0] as () => void;
    onPending();
    await flush();
    expect(hoisted.dropPaths).toHaveBeenCalledWith(["C:\b.flac"]);
    stop();
  });

  it("unlistens when stopped", async () => {
    const stop = startLaunchActions();
    await flush();
    stop();
    await flush();
    expect(hoisted.unlisten).toHaveBeenCalledTimes(1);
  });

  it("unlistens at once when stopped before the listener is ready", async () => {
    let resolveListen: (unlisten: () => void) => void = () => {};
    hoisted.listen.mockReturnValue(new Promise((resolve) => (resolveListen = resolve)));
    const stop = startLaunchActions();
    stop();
    resolveListen(hoisted.unlisten);
    await flush();
    expect(hoisted.unlisten).toHaveBeenCalledTimes(1);
  });
});

describe("launch targets", () => {
  it("opens a shared playlist", async () => {
    await routeLaunchTarget({ kind: "playlist", id: "PL9" });
    expect(useNavigation.getState().view).toEqual({ name: "ytplaylist", param: "VLPL9" });
    expect(hoisted.playTrack).not.toHaveBeenCalled();
  });

  it("plays a shared video", async () => {
    await routeLaunchTarget({ kind: "video", id: "dQw4w9WgXcQ" });
    expect(hoisted.playTrack).toHaveBeenCalledWith(expect.objectContaining({ id: "dQw4w9WgXcQ", thumb: null }));
  });

  it("starts an opened audio file on Android at once through the native queue", async () => {
    hoisted.platform = "android";
    const uri = "content://media/external/audio/media/42";
    await routeLaunchTarget({ kind: "file", uri });
    expect(hoisted.playerSetQueue).toHaveBeenCalledWith(
      [expect.objectContaining({ id: uri, contentUri: uri, url: "", expiresAtEpochMs: null })],
      0,
      0,
    );
    expect(hoisted.playerPlay).toHaveBeenCalledTimes(1);
    expect(hoisted.dropPaths).not.toHaveBeenCalled();
  });
});

describe("startLaunchActions on Android", () => {
  beforeEach(() => {
    hoisted.platform = "android";
  });

  it("takes a pending launch when it starts and plays it", async () => {
    hoisted.playerTakeLaunch.mockResolvedValueOnce({ kind: "text", value: "https://youtu.be/dQw4w9WgXcQ" });
    const stop = startLaunchActions();
    await vi.waitFor(() => expect(hoisted.playTrack).toHaveBeenCalledTimes(1));
    stop();
  });

  it("does nothing when no launch is pending", async () => {
    const stop = startLaunchActions();
    await vi.waitFor(() => expect(hoisted.playerTakeLaunch).toHaveBeenCalled());
    expect(hoisted.playTrack).not.toHaveBeenCalled();
    expect(hoisted.playerSetQueue).not.toHaveBeenCalled();
    stop();
  });

  it("listens for the launch event", async () => {
    startLaunchActions();
    expect(hoisted.listenPlayerEvent).toHaveBeenCalledWith("launch-intent", expect.any(Function));
    expect(hoisted.listen).not.toHaveBeenCalled();
  });
});
