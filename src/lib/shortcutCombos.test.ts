import { describe, expect, it, vi } from "vitest";

vi.mock("./audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { comboAction } from "./shortcuts";

const combo = (key: string, code: string, shiftKey = false) => comboAction({ key, code, shiftKey });

describe("comboAction", () => {
  it("focuses search from F, K or L", () => {
    expect(combo("f", "KeyF")).toBe("search");
    expect(combo("k", "KeyK")).toBe("search");
    expect(combo("l", "KeyL")).toBe("search");
  });

  it("creates a playlist with N and a folder with Shift+N", () => {
    expect(combo("n", "KeyN")).toBe("newPlaylist");
    expect(combo("N", "KeyN", true)).toBe("newFolder");
  });

  it("opens settings with comma", () => {
    expect(combo(",", "Comma")).toBe("settings");
  });

  it("zooms in and out and resets", () => {
    expect(combo("=", "Equal")).toBe("zoomIn");
    expect(combo("+", "Equal", true)).toBe("zoomIn");
    expect(combo("-", "Minus")).toBe("zoomOut");
    expect(combo("0", "Digit0")).toBe("zoomReset");
  });

  it("ignores other keys", () => {
    expect(combo("x", "KeyX")).toBeNull();
    expect(combo("1", "Digit1")).toBeNull();
  });
});
