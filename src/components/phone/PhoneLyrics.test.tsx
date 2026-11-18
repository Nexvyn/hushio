import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LyricsResult } from "../../lib/bridge";
import { forgetLyrics } from "../../lib/lyrics";
import { OnArtContext } from "../../lib/onArt";
import type { Track } from "../../types";

const { lyricsGet, lyricsReset, listenBack, exitApp } = vi.hoisted(() => ({
  lyricsGet: vi.fn(),
  lyricsReset: vi.fn(),
  listenBack: vi.fn(),
  exitApp: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/bridge")>()),
  lyricsGet,
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

const translated: LyricsResult = {
  synced: [
    { time: 1, text: "Bonjour line", translation: "Hello line" },
    { time: 2, text: "Second line" },
  ],
  plain: null,
  source: "LRCLIB",
  wordSynced: false,
};

beforeEach(() => {
  usePlayer.setState({ queue: [track], index: 0, playing: false, buffering: false, position: 0, duration: 272 });
  useUI.setState({ contextMenu: null, dialog: null, playlistPicker: null, phoneQueueOpen: false, nowPlayingOpen: true, toasts: [], pendingToasts: [] });
  lyricsGet.mockReset();
  lyricsReset.mockReset();
  listenBack.mockReset();
  listenBack.mockImplementation(() => Promise.resolve(() => {}));
});

afterEach(() => {
  cleanup();
  forgetLyrics(track.id);
});

describe("PhoneLyrics", () => {
  it("shows the empty state without any search control", async () => {
    lyricsGet.mockResolvedValue(null);
    render(<PhoneLyrics />);

    expect(await screen.findByText("Lyrics not available")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /search/i })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows automatic lyrics with no search control in the header", async () => {
    lyricsGet.mockResolvedValue(automatic);
    render(
      <OnArtContext.Provider value={true}>
        <PhoneLyrics />
      </OnArtContext.Provider>,
    );

    expect(await screen.findByText("automatic line")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /search/i })).toBeNull();
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

  it("shows Translate only for lyrics with translations and shows the translation when on", async () => {
    lyricsGet.mockResolvedValue(translated);
    render(<PhoneLyrics />);
    const toggle = await screen.findByRole("button", { name: "Translate lyrics" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("Hello line")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Translate lyrics" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Hello line")).toBeTruthy();
  });

  it("hides Translate when the lyrics have no translation", async () => {
    lyricsGet.mockResolvedValue(automatic);
    render(<PhoneLyrics />);
    expect(await screen.findByText("automatic line")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Translate lyrics" })).toBeNull();
  });

  it("has no lyrics share button", async () => {
    lyricsGet.mockResolvedValue(automatic);
    render(<PhoneLyrics />);
    expect(await screen.findByText("automatic line")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Share lyrics" })).toBeNull();
  });
});
