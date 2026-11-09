import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => {
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
    audio: new Audio(),
    playStream: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
  };
});

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play,
  pause,
  seekTo,
  setVolume,
  setMuted,
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PlayerBar } from "./PlayerBar";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();
const initialSettings = useSettings.getState();
const initialLibrary = useLibrary.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useUI.setState(initialUI, true);
  useSettings.setState(initialSettings, true);
  useLibrary.setState(initialLibrary, true);
});

afterEach(cleanup);

describe("PlayerBar with nothing queued", () => {
  it("shows the empty copy and disables previous and next", () => {
    render(<PlayerBar />);

    expect(screen.getByText("Nothing playing")).toBeTruthy();
    expect(screen.getByText("Search for something to play")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the play button and seek bar disabled", () => {
    render(<PlayerBar />);

    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Seek" }).getAttribute("aria-disabled")).toBe("true");
  });
});

describe("PlayerBar surface", () => {
  it("keeps the base background by default and has no ambient tint", () => {
    const { container } = render(<PlayerBar />);

    const footer = screen.getByLabelText("Player");
    expect(footer.className).toContain("bg-base");
    expect(container.querySelector('[class*="bg-ambient"]')).toBeNull();
  });

  it("renders a transparent footer with surface none", () => {
    render(<PlayerBar trackInfo={false} transport={false} surface="none" />);

    const footer = screen.getByLabelText("Player");
    expect(footer.className).not.toContain("bg-base");
    expect(footer.className).not.toContain("bg-ambient");
  });
});

describe("PlayerBar with a queue", () => {
  beforeEach(() => {
    usePlayer.getState().playQueue([track(0), track(1), track(2)], 0);
  });

  it("shows the current song and enables previous and next", () => {
    render(<PlayerBar />);

    expect(screen.getByText("Track 0")).toBeTruthy();
    expect(screen.getByText("Artist 0")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("leaves the song title out of the bar when the full-screen view already shows it", () => {
    render(<PlayerBar trackInfo={false} />);

    expect(screen.queryByText("Track 0")).toBeNull();
    expect(screen.queryByText("Artist 0")).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("switches between Play and Pause and calls the engine", async () => {
    const user = userEvent.setup();
    render(<PlayerBar />);

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("shows a spinner on the play button while buffering", () => {
    usePlayer.setState({ buffering: true });
    const { container } = render(<PlayerBar />);

    expect(container.querySelector('.bt-spin')).not.toBeNull();
  });

  it("moves to the next song from the next button", async () => {
    const user = userEvent.setup();
    render(<PlayerBar />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(usePlayer.getState().index).toBe(1);
    expect(screen.getByText("Track 1")).toBeTruthy();
  });

  it("changes the shuffle label when shuffle is turned on", async () => {
    const user = userEvent.setup();
    render(<PlayerBar />);

    await user.click(screen.getByRole("button", { name: "Enable Shuffle" }));
    expect(usePlayer.getState().shuffle).toBe(true);
    expect(screen.getByRole("button", { name: "Disable Shuffle" })).toBeTruthy();
  });

  it("cycles repeat through off, all and one", async () => {
    const user = userEvent.setup();
    render(<PlayerBar />);

    await user.click(screen.getByRole("button", { name: "Enable repeat" }));
    expect(screen.getByRole("button", { name: "Disable repeat" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Disable repeat" }));
    expect(screen.getByRole("button", { name: "Disable repeat one" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Disable repeat one" }));
    expect(screen.getByRole("button", { name: "Enable repeat" })).toBeTruthy();
  });

  it("seeks from the seek bar and shows the time", () => {
    usePlayer.setState({ position: 42, duration: 200 });
    render(<PlayerBar />);

    const slider = screen.getByRole("slider", { name: "Seek" });
    expect(slider.getAttribute("aria-disabled")).toBeNull();
    expect(slider.getAttribute("aria-valuenow")).toBe("42");
    expect(slider.getAttribute("aria-valuetext")).toBe("0:42 of 3:20");
    expect(screen.getByText("0:42")).toBeTruthy();
    expect(screen.getByText("3:20")).toBeTruthy();

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(seekTo).toHaveBeenCalledWith(47);
  });

  it("mutes from the volume button and reports the muted state", async () => {
    const user = userEvent.setup();
    render(<PlayerBar />);

    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(setMuted).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
  });

  it("hides the volume control when the setting is on", () => {
    useSettings.setState({ hideVolumeBar: true });
    render(<PlayerBar />);

    expect(screen.queryByRole("slider", { name: "Volume" })).toBeNull();
  });

  it("shows the volume control by default", () => {
    render(<PlayerBar />);

    expect(screen.getByRole("slider", { name: "Volume" })).toBeTruthy();
  });

  it("opens the queue panel from the queue button", async () => {
    const user = userEvent.setup();
    render(<PlayerBar />);

    await user.click(screen.getByRole("button", { name: "Queue" }));
    expect(useUI.getState().rightPanel).toBe("queue");
  });

  it("likes the playing song from the like button and unlikes it on the next press", async () => {
    const user = userEvent.setup();
    render(<PlayerBar />);

    const like = screen.getByRole("button", { name: "Like" });
    expect(like.getAttribute("aria-pressed")).toBe("false");
    await user.click(like);
    expect(useLibrary.getState().liked.map((item) => item.id)).toEqual(["t0"]);
    expect(screen.getByRole("button", { name: "Like" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Like" }).getAttribute("title")).toBe("Remove from Liked Songs");

    await user.click(screen.getByRole("button", { name: "Like" }));
    expect(useLibrary.getState().liked).toEqual([]);
    expect(screen.getByRole("button", { name: "Like" }).getAttribute("title")).toBe("Add to Liked Songs");
  });

  it("keeps the like button in place and disabled with nothing playing", () => {
    usePlayer.setState({ queue: [], index: 0 });
    render(<PlayerBar />);

    expect((screen.getByRole("button", { name: "Like" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
