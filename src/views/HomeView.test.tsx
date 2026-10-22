import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, seekTo } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  seekTo: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play: vi.fn(),
  pause: vi.fn(),
  seekTo,
  setVolume: vi.fn(),
  setMuted: vi.fn(),
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

import { HomeView } from "./HomeView";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();

describe("HomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlayer.setState(initialPlayer, true);
    useUI.setState({ toasts: [], pendingToasts: [] });
  });

  afterEach(cleanup);

  it("plays the test song through the queue when the play button is pressed", async () => {
    playStream.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(screen.getByRole("button", { name: "Play test song" }));

    expect(playStream).toHaveBeenCalledWith("test-song-id", "Test song");
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["test-song-id"]);
    expect(usePlayer.getState().playing).toBe(true);
  });

  it("shows an error toast when the test song fails to play", async () => {
    playStream.mockRejectedValue(new Error("No Piped mirror had a playable stream"));
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(screen.getByRole("button", { name: "Play test song" }));

    await waitFor(() => expect(useUI.getState().toasts).toHaveLength(1));
    expect(useUI.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: "Couldn't play \"Test song\"",
    });
    expect(seekTo).not.toHaveBeenCalled();
  });
});
