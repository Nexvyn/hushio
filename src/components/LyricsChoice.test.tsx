import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LyricsResult } from "../lib/bridge";
import { forgetLyrics } from "../lib/lyrics";
import { useTrackLyrics } from "../lib/useTrackLyrics";
import type { Track } from "../types";
import { LyricsChoice } from "./LyricsChoice";

const { lyricsGet, lyricsReset } = vi.hoisted(() => {
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
  return { lyricsGet: vi.fn(), lyricsReset: vi.fn() };
});

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  lyricsGet,
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

function Harness() {
  const { lyrics, loading, reload } = useTrackLyrics(track, 272);
  const text = loading ? "loading" : (lyrics?.synced?.[0]?.text ?? "none");
  return (
    <>
      <p>{text}</p>
      <LyricsChoice track={track} overridden={Boolean(lyrics?.custom)} onChanged={reload} />
    </>
  );
}

beforeEach(() => {
  lyricsGet.mockReset();
  lyricsReset.mockReset();
});

afterEach(() => {
  cleanup();
  forgetLyrics(track.id);
});

describe("LyricsChoice", () => {
  it("offers no search button while the automatic lyrics are shown", async () => {
    lyricsGet.mockResolvedValue(automatic);
    render(<Harness />);

    expect(await screen.findByText("automatic line")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Search lyrics" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset to automatic" })).toBeNull();
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
