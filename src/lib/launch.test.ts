import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  take: vi.fn(),
  listen: vi.fn(),
  dropPaths: vi.fn(),
  navigate: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("./bridge", () => ({
  launchTake: hoisted.take,
  listenLaunchPending: hoisted.listen,
}));
vi.mock("./localDrop", () => ({ dropPaths: hoisted.dropPaths }));
vi.mock("../stores/navigation", () => ({
  useNavigation: { getState: () => ({ navigate: hoisted.navigate }) },
}));

import { playlistBrowseId, routeLaunchAction, startLaunchActions } from "./launch";

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("launch actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.take.mockResolvedValue([]);
    hoisted.listen.mockResolvedValue(hoisted.unlisten);
    hoisted.dropPaths.mockResolvedValue(undefined);
  });

  it("adds the VL prefix to a playlist id once", () => {
    expect(playlistBrowseId("PL123")).toBe("VLPL123");
    expect(playlistBrowseId("VLPL123")).toBe("VLPL123");
  });

  it("plays a file action through the local file path", async () => {
    await routeLaunchAction({ type: "file", path: "C:\\Music\\a.mp3" });
    expect(hoisted.dropPaths).toHaveBeenCalledWith(["C:\\Music\\a.mp3"]);
    expect(hoisted.navigate).not.toHaveBeenCalled();
  });

  it("opens a playlist action in the YouTube playlist view", async () => {
    await routeLaunchAction({ type: "playlist", id: "PL123" });
    expect(hoisted.navigate).toHaveBeenCalledWith({ name: "ytplaylist", param: "VLPL123" });
    expect(hoisted.dropPaths).not.toHaveBeenCalled();
  });

  it("takes pending actions on start and routes each one", async () => {
    hoisted.take.mockResolvedValue([
      { type: "file", path: "C:\\a.mp3" },
      { type: "playlist", id: "PL9" },
    ]);
    const stop = startLaunchActions();
    await flush();
    expect(hoisted.dropPaths).toHaveBeenCalledWith(["C:\\a.mp3"]);
    expect(hoisted.navigate).toHaveBeenCalledWith({ name: "ytplaylist", param: "VLPL9" });
    stop();
  });

  it("takes pending actions again when the app is poked", async () => {
    const stop = startLaunchActions();
    await flush();
    expect(hoisted.take).toHaveBeenCalledTimes(1);
    hoisted.take.mockResolvedValue([{ type: "file", path: "C:\\b.flac" }]);
    const onPending = hoisted.listen.mock.calls[0][0] as () => void;
    onPending();
    await flush();
    expect(hoisted.dropPaths).toHaveBeenCalledWith(["C:\\b.flac"]);
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
