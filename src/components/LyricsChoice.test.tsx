import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LyricsCandidate, LyricsResult } from "../lib/bridge";
import { forgetLyrics } from "../lib/lyrics";
import { useTrackLyrics } from "../lib/useTrackLyrics";
import type { Track } from "../types";
import { LyricsChoice } from "./LyricsChoice";

const { lyricsGet, lyricsSearch, lyricsPick, lyricsReset } = vi.hoisted(() => {
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
  return { lyricsGet: vi.fn(), lyricsSearch: vi.fn(), lyricsPick: vi.fn(), lyricsReset: vi.fn() };
});

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  lyricsGet,
  lyricsSearch,
  lyricsPick,
  lyricsReset,
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const track: Track = { id: "choice-track", title: "Yellow", artist: "Coldplay", thumb: null };

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

function Harness() {
  const { lyrics, loading, reload } = useTrackLyrics(track, 272);
  const text = loading ? "loading" : (lyrics?.synced?.[0]?.text ?? "none");
  return (
    <>
      <p>{text}</p>
      <LyricsChoice track={track} duration={272} overridden={Boolean(lyrics?.custom)} onChanged={reload} />
    </>
  );
}

beforeEach(() => {
  lyricsGet.mockReset();
  lyricsSearch.mockReset();
  lyricsPick.mockReset();
  lyricsReset.mockReset();
});

afterEach(() => {
  cleanup();
  forgetLyrics(track.id);
});

describe("LyricsChoice", () => {
  it("picks a result, saves it for the song and shows it without refetching", async () => {
    lyricsGet.mockResolvedValue(automatic);
    lyricsSearch.mockResolvedValue([candidate]);
    lyricsPick.mockResolvedValue(chosen);
    render(<Harness />);
    expect(await screen.findByText("automatic line")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset to automatic" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Search lyrics" }));
    fireEvent.click(await screen.findByRole("button", { name: /Yellow/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Reset to automatic" })).toBeTruthy());
    expect(screen.getByText("chosen line", { selector: "p" })).toBeTruthy();
    expect(lyricsPick).toHaveBeenCalledWith("choice-track", "lrclib", "9001");
    expect(lyricsGet).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resets to the automatic lyrics and asks the backend to drop the choice", async () => {
    lyricsGet.mockResolvedValueOnce(chosen).mockResolvedValueOnce(automatic);
    lyricsReset.mockResolvedValue(undefined);
    render(<Harness />);
    expect(await screen.findByText("chosen line")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset to automatic" }));

    expect(await screen.findByText("automatic line")).toBeTruthy();
    expect(lyricsReset).toHaveBeenCalledWith("choice-track");
    await waitFor(() => expect(lyricsGet).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Reset to automatic" })).toBeNull();
  });
});
