import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  networkServers: vi.fn(),
  networkServerSave: vi.fn(),
  networkServerRemove: vi.fn(),
  networkTracks: vi.fn(),
  networkServerTest: vi.fn(),
  networkServerRefresh: vi.fn(),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  networkServers: bridge.networkServers,
  networkServerSave: bridge.networkServerSave,
  networkServerRemove: bridge.networkServerRemove,
  networkTracks: bridge.networkTracks,
  networkServerTest: bridge.networkServerTest,
  networkServerRefresh: bridge.networkServerRefresh,
}));

import { useNetwork } from "./network";
import { useUI } from "./ui";

const server = {
  id: "s1",
  kind: "webDav" as const,
  kindLabel: "WebDAV",
  name: "Box",
  url: "https://box.example/dav",
  host: "",
  share: "",
  path: "",
  username: "me",
  scannedAt: 0,
  songCount: 0,
  truncated: false,
  scanning: false,
  scanError: "",
};

const track = {
  id: "net:s1:/song.mp3",
  serverId: "s1",
  serverName: "Box",
  path: "/song.mp3",
  name: "song.mp3",
  title: "Song",
  artist: "Nova",
  album: "",
  size: 10,
};

describe("network store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUI.setState({ toasts: [], pendingToasts: [] });
    useNetwork.setState({ servers: [], tracks: {}, busy: false });
  });

  it("reads the servers from the backend", async () => {
    bridge.networkServers.mockResolvedValue([server]);
    await useNetwork.getState().load();
    expect(useNetwork.getState().servers).toEqual([server]);
  });

  it("keeps the servers it has when the read fails", async () => {
    bridge.networkServers.mockRejectedValue(new Error("offline"));
    await useNetwork.getState().load();
    expect(useNetwork.getState().servers).toEqual([]);
  });

  it("saves a server with its password", async () => {
    bridge.networkServerSave.mockResolvedValue([server]);
    const saved = await useNetwork.getState().save({
      id: "",
      kind: "webDav",
      name: "Box",
      url: "https://box.example/dav",
      host: "",
      share: "",
      path: "",
      username: "me",
      password: "secret",
    });
    expect(saved).toBe(true);
    expect(bridge.networkServerSave).toHaveBeenCalledWith(expect.objectContaining({ password: "secret" }));
  });

  it("shows a toast when a server cannot be saved", async () => {
    bridge.networkServerSave.mockRejectedValue(new Error("bad address"));
    const saved = await useNetwork.getState().save({
      id: "",
      kind: "webDav",
      name: "Box",
      url: "",
      host: "",
      share: "",
      path: "",
      username: "",
      password: "",
    });
    expect(saved).toBe(false);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("bad address");
  });

  it("removes a server and forgets its tracks", async () => {
    bridge.networkServerRemove.mockResolvedValue([]);
    bridge.networkTracks.mockResolvedValue([track]);
    await useNetwork.getState().loadTracks("s1", "");
    expect(useNetwork.getState().tracks.s1).toHaveLength(1);
    await useNetwork.getState().remove("s1");
    expect(useNetwork.getState().servers).toEqual([]);
    expect(useNetwork.getState().tracks.s1).toBeUndefined();
  });

  it("tests a music server and returns the plain answer", async () => {
    bridge.networkServerTest.mockResolvedValue("Connected to navidrome 0.53.3");
    const outcome = await useNetwork.getState().test({
      id: "",
      kind: "subsonic",
      name: "",
      url: "https://music.example",
      host: "",
      share: "",
      path: "",
      username: "me",
      password: "hunter2",
    });
    expect(outcome).toEqual({ ok: true, message: "Connected to navidrome 0.53.3" });
  });

  it("reports a failed test without throwing", async () => {
    bridge.networkServerTest.mockRejectedValue(new Error("Wrong username or password."));
    const outcome = await useNetwork.getState().test({
      id: "",
      kind: "subsonic",
      name: "",
      url: "https://music.example",
      host: "",
      share: "",
      path: "",
      username: "me",
      password: "nope",
    });
    expect(outcome).toEqual({ ok: false, message: "Wrong username or password." });
  });

  it("shows the message of a plain string rejection", async () => {
    bridge.networkServerTest.mockRejectedValue("Wrong username or password.");
    const outcome = await useNetwork.getState().test({
      id: "",
      kind: "subsonic",
      name: "",
      url: "https://music.example",
      host: "",
      share: "",
      path: "",
      username: "me",
      password: "nope",
    });
    expect(outcome).toEqual({ ok: false, message: "Wrong username or password." });
  });

  it("keeps the password out of the store and out of local storage", async () => {
    bridge.networkServerSave.mockResolvedValue([{ ...server, kind: "subsonic", kindLabel: "Music server" }]);
    await useNetwork.getState().save({
      id: "",
      kind: "subsonic",
      name: "",
      url: "https://music.example",
      host: "",
      share: "",
      path: "",
      username: "me",
      password: "hunter2-secret",
    });
    expect(JSON.stringify(useNetwork.getState())).not.toContain("hunter2-secret");
    expect(JSON.stringify({ ...localStorage })).not.toContain("hunter2-secret");
  });

  it("refreshes a music server and shows its scan state", async () => {
    bridge.networkServerRefresh.mockResolvedValue([{ ...server, scanning: true }]);
    await useNetwork.getState().refresh("s1");
    expect(useNetwork.getState().servers[0].scanning).toBe(true);
  });
});
