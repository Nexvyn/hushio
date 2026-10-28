import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { lyricsGet, setFullScreen } = vi.hoisted(() => ({ lyricsGet: vi.fn(), setFullScreen: vi.fn() }));

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
  setFullScreen,
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

vi.mock("./PlayerBar", () => ({ PlayerBar: () => null }));

import { NowPlaying } from "./NowPlaying";
import { canvasClipFor, rememberCanvasClip } from "../lib/canvas";
import { useLyricsNudge } from "../stores/lyricsNudge";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

let seq = 0;
let track = { id: "np-0", title: "Blue Song", artist: "The Band", thumb: null as string | null };

function setTrack(current: typeof track | null, playing = false) {
  usePlayer.setState({ queue: current ? [current] : [], index: 0, position: 0, duration: 0, playing });
}

function openView() {
  act(() => {
    useUI.setState({ nowPlayingOpen: true });
  });
}

function region() {
  return screen.queryByRole("region", { name: "Now Playing" });
}

describe("NowPlaying", () => {
  beforeEach(() => {
    cleanup();
    seq += 1;
    track = { id: `np-${seq}`, title: "Blue Song", artist: "The Band", thumb: null };
    lyricsGet.mockReset();
    lyricsGet.mockResolvedValue(null);
    setFullScreen.mockReset();
    setFullScreen.mockResolvedValue(undefined);
    useLyricsNudge.setState({ nudges: {} });
    useSettings.setState({ lyricsOffset: 0, animatedCanvas: false, fullBleedArtwork: true });
    useUI.setState({ nowPlayingOpen: false, lyricsCenter: false, osFullscreen: false, contextMenu: null, dialog: null, playlistPicker: null });
    setTrack(track);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders nothing while closed", () => {
    render(<NowPlaying />);
    expect(region()).toBeNull();
    expect(setFullScreen).not.toHaveBeenCalled();
  });

  it("opens with the track, the Esc hint and a request for full screen", () => {
    render(<NowPlaying />);
    openView();
    expect(region()).not.toBeNull();
    expect(screen.getByText("Blue Song")).toBeTruthy();
    expect(screen.getByText("The Band")).toBeTruthy();
    expect(screen.getByText("To exit full screen, press")).toBeTruthy();
    expect(setFullScreen).toHaveBeenLastCalledWith(true);
  });

  it("closes from the close button and leaves the full screen it entered", async () => {
    render(<NowPlaying />);
    openView();
    fireEvent.click(screen.getByRole("button", { name: "Close Now Playing" }));
    expect(useUI.getState().nowPlayingOpen).toBe(false);
    await waitFor(() => expect(region()).toBeNull());
    expect(setFullScreen).toHaveBeenLastCalledWith(false);
  });

  it("stays in full screen when the window was already full screen", async () => {
    useUI.setState({ osFullscreen: true });
    render(<NowPlaying />);
    openView();
    fireEvent.click(screen.getByRole("button", { name: "Close Now Playing" }));
    await waitFor(() => expect(region()).toBeNull());
    expect(setFullScreen).not.toHaveBeenCalledWith(false);
  });

  it("shows the empty state when nothing is playing", () => {
    setTrack(null);
    render(<NowPlaying />);
    openView();
    expect(screen.getByText("Nothing playing yet")).toBeTruthy();
    expect(screen.getByText("Play something and it will show up here.")).toBeTruthy();
  });

  it("swaps the cover for its looping clip only while animated covers are on", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    rememberCanvasClip(track.id, { url: "blob:clip" });
    const { container } = render(<NowPlaying />);
    openView();
    expect(container.querySelector("video")).toBeNull();

    act(() => {
      useSettings.setState({ animatedCanvas: true });
    });
    expect(container.querySelector("video")?.getAttribute("src")).toBe("blob:clip");
    expect(canvasClipFor(track.id)).toEqual({ url: "blob:clip" });
  });

  it("switches the side panel between lyrics and queue", () => {
    render(<NowPlaying />);
    openView();
    const group = within(screen.getByRole("group", { name: "Now Playing panel" }));
    expect(group.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(group.getByRole("button", { name: "Queue" }));
    expect(group.getByRole("button", { name: "Queue" }).getAttribute("aria-pressed")).toBe("true");
    expect(group.getByRole("button", { name: "Lyrics" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("hides the chrome after three seconds of playback and shows it again on pointer movement", () => {
    vi.useFakeTimers();
    setTrack(track, true);
    render(<NowPlaying />);
    openView();
    const section = region();
    expect(section?.getAttribute("data-idle")).toBe("false");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(section?.getAttribute("data-idle")).toBe("true");

    fireEvent(window, new Event("pointermove"));
    expect(section?.getAttribute("data-idle")).toBe("false");
  });

  it("keeps the chrome while nothing is playing", () => {
    vi.useFakeTimers();
    render(<NowPlaying />);
    openView();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(region()?.getAttribute("data-idle")).toBe("false");
  });

  it("nudges the song's lyrics with the bracket keys while open", () => {
    render(<NowPlaying />);
    openView();
    fireEvent.keyDown(window, { code: "BracketRight" });
    expect(useLyricsNudge.getState().nudges[track.id]).toBe(0.25);
    fireEvent.keyDown(window, { code: "BracketLeft" });
    fireEvent.keyDown(window, { code: "BracketLeft" });
    expect(useLyricsNudge.getState().nudges[track.id]).toBe(-0.25);
  });

  it("leaves the bracket keys to the lyrics centre while it is open", () => {
    useUI.setState({ lyricsCenter: true });
    render(<NowPlaying />);
    openView();
    fireEvent.keyDown(window, { code: "BracketRight" });
    expect(useLyricsNudge.getState().nudges).toEqual({});
  });

  it("follows the Library when the song is added with the pill", () => {
    render(<NowPlaying />);
    openView();
    const pill = screen.getByRole("button", { name: "Add to Library" });
    fireEvent.click(pill);
    expect(screen.getByRole("button", { name: "In Your Library" }).getAttribute("aria-pressed")).toBe("true");
  });
});
