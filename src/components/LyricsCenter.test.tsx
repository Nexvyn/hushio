import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { lyricsGet } = vi.hoisted(() => {
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
  return { lyricsGet: vi.fn() };
});

vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getPlaybackPosition: vi.fn(() => 0),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  lyricsGet,
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { LyricsCenter } from "./LyricsCenter";
import { requestLyrics } from "../lib/lyrics";
import { usePlayer } from "../stores/player";
import { useLyricsNudge } from "../stores/lyricsNudge";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

let trackSeq = 0;
let track = { id: "song-0", title: "Song one", artist: "Artist", thumb: null };

function setTrack(current: typeof track | null) {
  usePlayer.setState({ queue: current ? [current] : [], index: 0, position: 0, duration: 0, playing: false });
}

describe("LyricsCenter", () => {
  beforeEach(() => {
    cleanup();
    trackSeq += 1;
    track = { id: `song-${trackSeq}`, title: "Song one", artist: "Artist", thumb: null };
    lyricsGet.mockReset();
    lyricsGet.mockResolvedValue(null);
    useLyricsNudge.setState({ nudges: {} });
    useSettings.setState({ lyricsOffset: 0, syncedLyrics: true, blurUnfocusedLyrics: true, romanizeLyrics: false });
    useUI.setState({ lyricsCenter: true });
    setTrack(track);
  });

  it("asks the player to sing along when nothing is playing", () => {
    setTrack(null);
    render(<LyricsCenter />);
    expect(screen.getByText("Play something to sing along.")).toBeTruthy();
    expect(lyricsGet).not.toHaveBeenCalled();
  });

  it("shows the not-found text when the lookup has no lyrics", async () => {
    render(<LyricsCenter />);
    expect(lyricsGet).toHaveBeenCalledWith(expect.objectContaining({ id: track.id, title: "Song one" }));
    expect(await screen.findByText("No lyrics available for this track.")).toBeTruthy();
  });

  it("renders the synced lines once the lookup answers", async () => {
    lyricsGet.mockResolvedValue({
      synced: [
        { time: 1, text: "Alpha" },
        { time: 2, text: "Beta" },
      ],
      plain: null,
      source: "Source",
      wordSynced: false,
    });
    render(<LyricsCenter />);
    await waitFor(() => expect(document.querySelectorAll("button[data-line]")).toHaveLength(2));
    expect(screen.getByText("Lyrics from Source")).toBeTruthy();
  });

  it("closes through the close button", () => {
    render(<LyricsCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Close lyrics" }));
    expect(useUI.getState().lyricsCenter).toBe(false);
  });

  it("nudges the song earlier with [ and later with ]", () => {
    render(<LyricsCenter />);
    fireEvent.keyDown(window, { code: "BracketLeft" });
    expect(useLyricsNudge.getState().nudges[track.id]).toBe(-0.25);
    expect(screen.getByRole("button", { name: "Show lyrics earlier" })).toBeTruthy();
    expect(screen.getByText("0.25 s earlier")).toBeTruthy();

    fireEvent.keyDown(window, { code: "BracketRight" });
    fireEvent.keyDown(window, { code: "BracketRight" });
    expect(useLyricsNudge.getState().nudges[track.id]).toBe(0.25);
    expect(screen.getByText("0.25 s later")).toBeTruthy();
  });

  it("ignores the nudge keys while typing in a text field", () => {
    render(
      <>
        <input aria-label="Filter" />
        <LyricsCenter />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("Filter"), { code: "BracketLeft" });
    expect(useLyricsNudge.getState().nudges).toEqual({});
  });

  it("resets the song's timing from the readout", () => {
    useLyricsNudge.setState({ nudges: { [track.id]: 1.5 } });
    render(<LyricsCenter />);
    fireEvent.click(screen.getByText("1.5 s later"));
    expect(useLyricsNudge.getState().nudges).toEqual({});
  });

  it("adds the per-song nudge to the device offset used by the lines", async () => {
    useSettings.setState({ lyricsOffset: 0.5 });
    useLyricsNudge.setState({ nudges: { [track.id]: 1 } });
    lyricsGet.mockResolvedValue({ synced: [{ time: 2, text: "Gamma" }], plain: null, source: "S", wordSynced: false });
    render(<LyricsCenter />);
    await waitFor(() => expect(document.querySelector("button[data-line]")).not.toBeNull());
    fireEvent.click(document.querySelector<HTMLButtonElement>("button[data-line]")!);
    expect(usePlayer.getState().position).toBeCloseTo(2 + 1.5 - 0.15, 5);
  });

  it("shows the translate toggle only when the lines have translations, and shows them on press", async () => {
    lyricsGet.mockResolvedValue({
      synced: [
        { time: 1, text: "Alpha", translation: "Alfa" },
        { time: 2, text: "Beta" },
      ],
      plain: null,
      source: "S",
      wordSynced: false,
    });
    render(<LyricsCenter />);
    await waitFor(() => expect(document.querySelectorAll("button[data-line]")).toHaveLength(2));
    expect(screen.queryByText("Alfa")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Show translations" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Alfa")).toBeTruthy();
  });

  it("hides the translate toggle when no line has a translation", async () => {
    lyricsGet.mockResolvedValue({ synced: [{ time: 1, text: "Alpha" }], plain: null, source: "S", wordSynced: false });
    render(<LyricsCenter />);
    await waitFor(() => expect(document.querySelectorAll("button[data-line]")).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "Show translations" })).toBeNull();
  });

  it("draws the active line in ink-1 and the nearby line in ink-2", async () => {
    usePlayer.setState({ position: 1.5 });
    lyricsGet.mockResolvedValue({
      synced: [
        { time: 1, text: "Alpha" },
        { time: 2, text: "Beta" },
      ],
      plain: null,
      source: "S",
      wordSynced: false,
    });
    render(<LyricsCenter />);
    await waitFor(() => expect(document.querySelectorAll("button[data-line]")).toHaveLength(2));
    const [first, second] = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-line]"));
    expect(first.className).toContain("text-ink-1");
    expect(first.className).not.toContain("text-ink-3");
    expect(second.className).toContain("text-ink-2");
    expect(second.className).not.toContain("text-ink-1");
  });

  it("does not look up the same track again on a second open", async () => {
    vi.spyOn(Date, "now").mockReturnValue(0);
    expect(await requestLyrics(track)).toBeNull();
    render(<LyricsCenter />);
    await screen.findByText("No lyrics available for this track.");
    expect(lyricsGet).toHaveBeenCalledTimes(1);
  });
});
