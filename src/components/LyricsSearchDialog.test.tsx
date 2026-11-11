import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LyricsCandidate, LyricsResult } from "../lib/bridge";
import { forgetLyrics } from "../lib/lyrics";
import type { Track } from "../types";
import { LyricsSearchDialog } from "./LyricsSearchDialog";

const { lyricsSearch, lyricsPick } = vi.hoisted(() => {
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
  return { lyricsSearch: vi.fn(), lyricsPick: vi.fn() };
});

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  lyricsSearch,
  lyricsPick,
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const track: Track = { id: "dialog-track", title: "Yellow", artist: "Coldplay", thumb: null };

const synced: LyricsCandidate = {
  provider: "lrclib",
  candidateId: "33756008",
  title: "Coldplay - Yellow",
  artist: "Coldplay",
  album: "Parachutes",
  duration: 273,
  synced: true,
  preview: ["Look at the stars", "Look how they shine for you"],
};

const plain: LyricsCandidate = {
  provider: "lrclib",
  candidateId: "555",
  title: "Yellow (Live)",
  artist: "Coldplay",
  album: null,
  duration: 180,
  synced: false,
  preview: ["Live words"],
};

const chosen: LyricsResult = {
  synced: [{ time: 1, text: "chosen line" }],
  plain: null,
  source: "LRCLIB",
  wordSynced: false,
  custom: true,
};

function renderDialog(overrides: Partial<Parameters<typeof LyricsSearchDialog>[0]> = {}) {
  const props = {
    track,
    duration: 272,
    onClose: vi.fn(),
    onPicked: vi.fn(),
    ...overrides,
  };
  render(<LyricsSearchDialog {...props} />);
  return props;
}

beforeEach(() => {
  lyricsSearch.mockReset();
  lyricsPick.mockReset();
});

afterEach(() => {
  cleanup();
  forgetLyrics(track.id);
});

describe("LyricsSearchDialog", () => {
  it("prefills Artist Title, searches on open and lists results with length, badge and preview", async () => {
    lyricsSearch.mockResolvedValue([synced, plain]);
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Search lyrics" })).toBeTruthy();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("Coldplay Yellow");
    await waitFor(() => expect(screen.getByRole("list", { name: "Lyrics results" })).toBeTruthy());

    expect(lyricsSearch).toHaveBeenCalledWith("Coldplay Yellow", 272);
    expect(screen.getByRole("button", { name: /Coldplay - Yellow/ })).toBeTruthy();
    expect(screen.getByText(/Parachutes/)).toBeTruthy();
    expect(screen.getByText("4:33")).toBeTruthy();
    expect(screen.getByText("Synced")).toBeTruthy();
    expect(screen.getByText("Plain text")).toBeTruthy();
    expect(screen.getByText("Length match")).toBeTruthy();
    expect(screen.getByText("Look how they shine for you")).toBeTruthy();
  });

  it("runs a new search when the query is submitted", async () => {
    lyricsSearch.mockResolvedValueOnce([synced]).mockResolvedValueOnce([plain]);
    renderDialog();
    await screen.findByRole("button", { name: /Coldplay - Yellow/ });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Yellow live" } });
    fireEvent.submit(screen.getByRole("search"));

    await screen.findByRole("button", { name: /Yellow \(Live\)/ });
    expect(lyricsSearch).toHaveBeenLastCalledWith("Yellow live", 272);
  });

  it("saves the clicked result for this song and reports it picked", async () => {
    lyricsSearch.mockResolvedValue([synced]);
    lyricsPick.mockResolvedValue(chosen);
    const { onPicked } = renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: /Coldplay - Yellow/ }));

    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(lyricsPick).toHaveBeenCalledWith("dialog-track", "lrclib", "33756008");
  });

  it("shows an empty message when nothing matches", async () => {
    lyricsSearch.mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText(/No lyrics found for that search/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Lyrics results" })).toBeNull();
  });

  it("shows the error message when the search fails", async () => {
    lyricsSearch.mockRejectedValue("LRCLIB could not be reached");
    renderDialog();

    expect((await screen.findByRole("alert")).textContent).toBe("LRCLIB could not be reached");
  });

  it("shows an error and keeps the results when saving fails", async () => {
    lyricsSearch.mockResolvedValue([synced]);
    lyricsPick.mockRejectedValue("That result has no lyrics");
    const { onPicked } = renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: /Coldplay - Yellow/ }));

    expect((await screen.findByRole("alert")).textContent).toBe("That result has no lyrics");
    expect(onPicked).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Coldplay - Yellow/ })).toBeTruthy();
  });

  it("closes on Escape", async () => {
    lyricsSearch.mockResolvedValue([]);
    const { onClose } = renderDialog();
    await screen.findByText(/No lyrics found/);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
