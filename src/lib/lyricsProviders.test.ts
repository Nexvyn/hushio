import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { LYRICS_PROVIDERS, toggleLyricsProvider, useSettings } from "../stores/settings";
import { requestLyrics } from "./lyrics";

const bridge = vi.hoisted(() => ({ lyricsGet: vi.fn() }));

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  lyricsGet: bridge.lyricsGet,
}));

describe("lyrics providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettings.setState({ lyricsProviders: LYRICS_PROVIDERS.map((provider) => provider.id) });
  });

  it("starts with every source on", () => {
    expect(useSettings.getState().lyricsProviders).toHaveLength(LYRICS_PROVIDERS.length);
  });

  it("turns a source off and on again", () => {
    const off = toggleLyricsProvider(useSettings.getState().lyricsProviders, "genius");
    expect(off).not.toContain("genius");
    const on = toggleLyricsProvider(off, "genius");
    expect(on).toContain("genius");
  });

  it("sends the chosen sources with the request", async () => {
    bridge.lyricsGet.mockResolvedValue(null);
    useSettings.setState({ lyricsProviders: ["lrclib", "kugou"] });
    await requestLyrics({ id: "t1", title: "Song", artist: "Singer", thumb: null });
    expect(bridge.lyricsGet).toHaveBeenCalledWith(expect.objectContaining({ providers: ["lrclib", "kugou"] }));
  });
});
