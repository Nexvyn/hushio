import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, seekTo } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  seekTo: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  seekTo,
  TEST_SONG_ID: "test-song-id",
}));

import { HomeView } from "./HomeView";
import { useUI } from "../stores/ui";

function setMediaTimes(duration: number, currentTime: number) {
  Object.defineProperty(audio, "duration", { value: duration, configurable: true });
  Object.defineProperty(audio, "currentTime", { value: currentTime, configurable: true });
}

describe("HomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMediaTimes(Number.NaN, 0);
    useUI.setState({ toasts: [], pendingToasts: [] });
  });

  afterEach(cleanup);

  it("plays the test song when the play button is pressed", async () => {
    playStream.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(screen.getByRole("button", { name: "Play test song" }));

    expect(playStream).toHaveBeenCalledWith("test-song-id");
  });

  it("shows an error toast when the test song fails to play", async () => {
    playStream.mockRejectedValue(new Error("No Piped mirror had a playable stream"));
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(screen.getByRole("button", { name: "Play test song" }));

    await waitFor(() => expect(useUI.getState().toasts).toHaveLength(1));
    expect(useUI.getState().toasts[0]).toMatchObject({
      kind: "error",
      message: "Could not play the test song: No Piped mirror had a playable stream",
    });
  });

  it("keeps the seek slider disabled until the song duration is known", () => {
    render(<HomeView />);

    expect(screen.getByRole<HTMLInputElement>("slider", { name: "Seek" }).disabled).toBe(true);
  });

  it("follows the playhead and seeks when the slider moves", async () => {
    render(<HomeView />);

    setMediaTimes(200, 0);
    fireEvent(audio, new Event("loadedmetadata"));
    const slider = screen.getByRole<HTMLInputElement>("slider", { name: "Seek" });
    expect(slider.disabled).toBe(false);
    expect(slider.max).toBe("200");

    setMediaTimes(200, 42);
    fireEvent(audio, new Event("timeupdate"));
    expect(slider.value).toBe("42");

    fireEvent.change(slider, { target: { value: "30" } });
    expect(seekTo).toHaveBeenCalledWith(30);
  });
});
