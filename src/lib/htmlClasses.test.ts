import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { lyricScale } from "./htmlClasses";
import { useSettings } from "../stores/settings";

describe("lyricScale", () => {
  beforeEach(() => {
    useSettings.setState({ lyricsTextSize: "medium" });
  });

  it("is one for the medium size", () => {
    expect(lyricScale("medium")).toBe("1");
  });

  it("is smaller for the small size and larger for the large one", () => {
    expect(Number(lyricScale("small"))).toBeLessThan(1);
    expect(Number(lyricScale("large"))).toBeGreaterThan(1);
  });
});
