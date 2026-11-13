import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { LyricsCandidate, LyricsResult } from "../../lib/bridge";
import { forgetLyrics } from "../../lib/lyrics";
import { OnArtContext } from "../../lib/onArt";
import type { Track } from "../../types";

const { lyricsGet, lyricsSearch, lyricsPick, lyricsReset, listenBack, exitApp } = vi.hoisted(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  }
  return {
    lyricsGet: vi.fn(),
    lyricsSearch: vi.fn(),
    lyricsPick: vi.fn(),
    lyricsReset: vi.fn(),
    listenBack: vi.fn(),
    exitApp: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("../../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/bridge")>()),
  lyricsGet,
  lyricsSearch,
  lyricsPick,
  lyricsReset,
  listenBackButton: listenBack,
  exitApp,
}));

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PhoneLyrics } from "./PhoneLyrics";
import { usePhoneBack } from "./usePhoneBack";
import { usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";

const track: Track = { id: "phone-lyrics-track", title: "Yellow", artist: "Coldplay", thumb: null };

const automatic: LyricsResult = {
  synced: [{ time: 1, text: "automatic line" }],
  plain: null,
  source: "LRCLIB",
  wordSynced: false,
};

const chosen: LyricsResult = {
  synced: [{ time: 1, text: "chosen line" }],
  plain: null,
  source: "LRCLIB",
  wordSynced: false,
  custom: true,
};

const candidate: LyricsCandidate = {
  provider: "lrclib",
  candidateId: "9001",
  title: "Yellow",
  artist: "Coldplay",
  album: null,
  duration: 272,
  synced: true,
  preview: ["Look at the stars"],
};

const sheetName = { name: "Search lyrics" };

beforeEach(() => {
  usePlayer.setState({ queue: [track], index: 0, playing: false, buffering: false, position: 0, duration: 272 });
  useUI.setState({ phoneLyricsSearchOpen: false, contextMenu: null, dialog: null, playlistPicker: null, phoneQueueOpen: false, nowPlayingOpen: true, toasts: [], pendingToasts: [] });
  lyricsGet.mockReset();
  lyricsSearch.mockReset();
  lyricsPick.mockReset();
  lyricsReset.mockReset();
  listenBack.mockReset();
  listenBack.mockImplementation(() => Promise.resolve(() => {}));
});

afterEach(() => {
  cleanup();
  forgetLyrics(track.id);
});

describe("PhoneLyrics", () => {
  it("shows Search lyrics in the empty state and opens the search sheet", async () => {
    lyricsGet.mockResolvedValue(null);
    lyricsSearch.mockResolvedValue([candidate]);
    render(<PhoneLyrics />);

    expect(await screen.findByText("No lyrics")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search lyrics" }));

    expect(await screen.findByRole("dialog", sheetName)).toBeTruthy();
    expect(lyricsSearch).toHaveBeenCalledWith("Coldplay Yellow", 272);
    expect(await screen.findByRole("button", { name: /Yellow/ })).toBeTruthy();
  });

  it("picks a result, closes the sheet and shows the chosen lyrics", async () => {
    lyricsGet.mockResolvedValue(null);
    lyricsSearch.mockResolvedValue([candidate]);
    lyricsPick.mockResolvedValue(chosen);
    render(<PhoneLyrics />);
    expect(await screen.findByText("No lyrics")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Search lyrics" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Yellow/ }));

    expect(await screen.findByText("chosen line")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog", sheetName)).toBeNull(), { timeout: 3000 });
    expect(lyricsPick).toHaveBeenCalledWith("phone-lyrics-track", "lrclib", "9001");
    expect(lyricsGet).toHaveBeenCalledTimes(1);
  });

  it("hides Reset to automatic for automatic lyrics", async () => {
    lyricsGet.mockResolvedValue(automatic);
    render(<PhoneLyrics />);
    expect(await screen.findByText("automatic line")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset to automatic" })).toBeNull();
  });

  it("calls lyricsReset from Reset to automatic and shows the automatic lyrics", async () => {
    lyricsGet.mockResolvedValueOnce(chosen).mockResolvedValueOnce(automatic);
    lyricsReset.mockResolvedValue(undefined);
    render(<PhoneLyrics />);
    expect(await screen.findByText("chosen line")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset to automatic" }));

    expect(await screen.findByText("automatic line")).toBeTruthy();
    expect(lyricsReset).toHaveBeenCalledWith("phone-lyrics-track");
    await waitFor(() => expect(lyricsGet).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Reset to automatic" })).toBeNull();
  });

  it("closes the search sheet on Android back and leaves Now Playing open", async () => {
    lyricsGet.mockResolvedValue(null);
    lyricsSearch.mockResolvedValue([candidate]);
    renderHook(() => usePhoneBack());
    render(<PhoneLyrics />);
    expect(await screen.findByText("No lyrics")).toBeTruthy();
    await waitFor(() => expect(listenBack).toHaveBeenCalled());
    const onBack = listenBack.mock.calls[0][0] as () => void;

    fireEvent.click(screen.getAllByRole("button", { name: "Search lyrics" })[0]);
    expect(await screen.findByRole("dialog", sheetName)).toBeTruthy();

    act(() => onBack());

    await waitFor(() => expect(screen.queryByRole("dialog", sheetName)).toBeNull(), { timeout: 3000 });
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("draws the search button in the on-art colour over the artwork", async () => {
    lyricsGet.mockResolvedValue(automatic);
    render(
      <OnArtContext.Provider value={true}>
        <PhoneLyrics />
      </OnArtContext.Provider>,
    );
    expect(await screen.findByText("automatic line")).toBeTruthy();
    const search = screen.getByRole("button", { name: "Search lyrics" });
    expect(search.className).toContain("text-art");
    expect(search.className).not.toContain("text-ink-1");
  });
});
