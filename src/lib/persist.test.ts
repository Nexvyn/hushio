import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  persistRead: vi.fn(),
  persistWrite: vi.fn(),
}));

vi.mock("./bridge", () => bridge);

import { useUI } from "../stores/ui";
import { persistStorage } from "./persist";

type Player = { volume: number };

const toast = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ toast });
});

describe("persistStorage", () => {
  it("reads the stored envelope for the guest owner", async () => {
    const envelope = { state: { volume: 0.4 }, version: 0 };
    bridge.persistRead.mockResolvedValue(envelope);
    const storage = persistStorage<Player>("player");

    await expect(storage.getItem("player")).resolves.toEqual(envelope);
    expect(bridge.persistRead).toHaveBeenCalledWith("player", "guest");
  });

  it("returns null when the native side has no value", async () => {
    bridge.persistRead.mockResolvedValue(null);
    await expect(persistStorage<Player>("player").getItem("player")).resolves.toBeNull();
  });

  it("returns null when the native side answers undefined", async () => {
    bridge.persistRead.mockResolvedValue(undefined);
    await expect(persistStorage<Player>("player").getItem("player")).resolves.toBeNull();
  });

  it("writes the envelope under the store name", async () => {
    bridge.persistWrite.mockResolvedValue(true);
    const envelope = { state: { volume: 0.9 }, version: 0 };

    await persistStorage<Player>("player").setItem("player", envelope);

    expect(bridge.persistWrite).toHaveBeenCalledWith("player", envelope, "guest");
  });

  it("removes a store by writing null", async () => {
    bridge.persistWrite.mockResolvedValue(true);

    await persistStorage<Player>("player").removeItem("player");

    expect(bridge.persistWrite).toHaveBeenCalledWith("player", null, "guest");
  });

  it("passes an account owner through to every call", async () => {
    bridge.persistRead.mockResolvedValue(null);
    bridge.persistWrite.mockResolvedValue(true);
    const storage = persistStorage<Player>("library", "1234567890");

    await storage.getItem("library");
    await storage.setItem("library", { state: { volume: 1 }, version: 0 });
    await storage.removeItem("library");

    expect(bridge.persistRead).toHaveBeenCalledWith("library", "1234567890");
    expect(bridge.persistWrite).toHaveBeenNthCalledWith(
      1,
      "library",
      { state: { volume: 1 }, version: 0 },
      "1234567890",
    );
    expect(bridge.persistWrite).toHaveBeenNthCalledWith(2, "library", null, "1234567890");
  });

  it("lets a failed native read reject instead of hiding it", async () => {
    bridge.persistRead.mockRejectedValue(new Error("disk unavailable"));
    await expect(persistStorage<Player>("player").getItem("player")).rejects.toThrow(
      "disk unavailable",
    );
  });

  it("does not throw out of setItem or removeItem when the native write fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    bridge.persistWrite.mockRejectedValue(new Error("store is larger than 16 MiB"));
    const storage = persistStorage<Player>("player");

    await expect(
      storage.setItem("player", { state: { volume: 1 }, version: 0 }),
    ).resolves.toBeUndefined();
    await expect(storage.removeItem("player")).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0]?.[0]).toContain("player");
    error.mockRestore();
  });

  it("shows one save failure toast per store per minute", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      bridge.persistWrite.mockRejectedValue(new Error("disk full"));
      const state = { state: { volume: 1 }, version: 0 };
      const quick = persistStorage<Player>("toast-once");
      const other = persistStorage<Player>("toast-other");

      await quick.setItem("toast-once", state);
      await quick.setItem("toast-once", state);
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(expect.stringContaining("Couldn't save"), "error");

      await other.setItem("toast-other", state);
      expect(toast).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(60_000);
      await quick.setItem("toast-once", state);
      expect(toast).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs writes to the same store one after another in call order", async () => {
    const started: string[] = [];
    let releaseFirst: () => void = () => {};
    bridge.persistWrite
      .mockImplementationOnce(async () => {
        started.push("first");
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        return true;
      })
      .mockImplementationOnce(async () => {
        started.push("second");
        return true;
      });
    const storage = persistStorage<Player>("player");

    const first = storage.setItem("player", { state: { volume: 0.1 }, version: 0 });
    const second = storage.removeItem("player");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["first"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(started).toEqual(["first", "second"]);
    expect(bridge.persistWrite).toHaveBeenNthCalledWith(
      1,
      "player",
      { state: { volume: 0.1 }, version: 0 },
      "guest",
    );
    expect(bridge.persistWrite).toHaveBeenNthCalledWith(2, "player", null, "guest");
  });

  it("does not let a failed write block the next one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    bridge.persistWrite.mockRejectedValueOnce(new Error("disk full")).mockResolvedValueOnce(true);
    const storage = persistStorage<Player>("player");

    const failing = storage.setItem("player", { state: { volume: 0.2 }, version: 0 });
    const next = storage.setItem("player", { state: { volume: 0.3 }, version: 0 });

    await expect(failing).resolves.toBeUndefined();
    await expect(next).resolves.toBeUndefined();
    expect(bridge.persistWrite).toHaveBeenCalledTimes(2);
    expect(bridge.persistWrite).toHaveBeenLastCalledWith(
      "player",
      { state: { volume: 0.3 }, version: 0 },
      "guest",
    );
  });
});
