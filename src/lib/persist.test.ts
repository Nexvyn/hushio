import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  persistRead: vi.fn(),
  persistWrite: vi.fn(),
}));

vi.mock("./bridge", () => bridge);

import { persistStorage } from "./persist";

type Player = { volume: number };

beforeEach(() => {
  vi.clearAllMocks();
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

  it("lets a failed native write reject instead of hiding it", async () => {
    bridge.persistWrite.mockRejectedValue(new Error("store is larger than 16 MiB"));
    await expect(
      persistStorage<Player>("player").setItem("player", { state: { volume: 1 }, version: 0 }),
    ).rejects.toThrow("store is larger than 16 MiB");
  });
});
