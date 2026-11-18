import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const { useCanvasClip } = vi.hoisted(() => ({ useCanvasClip: vi.fn((): string | null => null) }));

vi.mock("./useCanvasClip", () => ({ useCanvasClip }));

vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(async () => undefined),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { RightRail } from "./RightRail";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import type { Track } from "../types";

const track: Track = { id: "t0", title: "Track 0", artist: "Artist 0", thumb: null };

beforeEach(() => {
  useCanvasClip.mockReturnValue(null);
  usePlayer.setState({ queue: [track], index: 0, playing: true });
  useSettings.setState({ animatedCovers: true, dataSaver: false });
});

afterEach(cleanup);

describe("animated cover in the right rail", () => {
  it("asks for the clip only when animated covers are on and data saver is off", () => {
    render(<RightRail />);
    expect(useCanvasClip).toHaveBeenLastCalledWith(track, true);

    useSettings.setState({ dataSaver: true });
    render(<RightRail />);
    expect(useCanvasClip).toHaveBeenLastCalledWith(track, false);

    useSettings.setState({ dataSaver: false, animatedCovers: false });
    render(<RightRail />);
    expect(useCanvasClip).toHaveBeenLastCalledWith(track, false);
  });

  it("plays a muted, looping clip over the cover when one is available", () => {
    useCanvasClip.mockReturnValue("https://clip.example/t0.mp4");
    const { container } = render(<RightRail />);
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
  });

  it("renders no video when the clip is not available", () => {
    const { container } = render(<RightRail />);
    expect(container.querySelector("video")).toBeNull();
  });
});
