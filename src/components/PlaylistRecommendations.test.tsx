import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Playlist } from "../stores/library";
import { useLibrary } from "../stores/library";
import type { Track } from "../types";
import { loadRecommendations, resetRecommendationCache } from "../lib/playlistRecommend";
import { PlaylistRecommendations } from "./PlaylistRecommendations";

vi.mock("../lib/bridge", async () => ({
  ...(await vi.importActual<typeof import("../lib/bridge")>("../lib/bridge")),
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
}));

vi.mock("../lib/playlistRecommend", async () => {
  const actual = await vi.importActual<typeof import("../lib/playlistRecommend")>("../lib/playlistRecommend");
  return { ...actual, loadRecommendations: vi.fn() };
});

const track = (id: string, title: string): Track => ({ id, title, artist: "Artist", thumb: null });
const playlist: Playlist = {
  id: "pl-1",
  name: "Mix",
  folderId: null,
  pinned: false,
  tracks: [{ ...track("m1", "Member"), album: null, duration: 200, explicit: false }],
};

beforeEach(() => {
  resetRecommendationCache();
  useLibrary.setState({ playlists: [playlist] });
  vi.mocked(loadRecommendations).mockReset();
  vi.mocked(loadRecommendations).mockResolvedValue([track("r1", "First pick"), track("r2", "Second pick")]);
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
});

afterEach(() => {
  cleanup();
});

describe("PlaylistRecommendations", () => {
  it("lists suggestions and adds one, removing its row", async () => {
    render(<PlaylistRecommendations playlist={playlist} />);
    expect(await screen.findByText("First pick")).toBeTruthy();
    expect(screen.getByText("Based on what's in this playlist")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add First pick to Mix" }));
    await waitFor(() => expect(screen.queryByText("First pick")).toBeNull());
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toContain("r1");
  });

  it("renders nothing for an empty playlist", () => {
    const empty = { ...playlist, tracks: [] };
    const { container } = render(<PlaylistRecommendations playlist={empty} />);
    expect(container.textContent).toBe("");
    expect(loadRecommendations).not.toHaveBeenCalled();
  });

  it("renders nothing while offline", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    const { container } = render(<PlaylistRecommendations playlist={playlist} />);
    expect(container.textContent).toBe("");
    expect(loadRecommendations).not.toHaveBeenCalled();
  });

  it("Refresh asks for a new set that excludes the rows on screen", async () => {
    render(<PlaylistRecommendations playlist={playlist} />);
    await screen.findByText("First pick");
    vi.mocked(loadRecommendations).mockResolvedValueOnce([track("r3", "Fresh pick")]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Fresh pick")).toBeTruthy();
    const shown = vi.mocked(loadRecommendations).mock.calls[1][1];
    expect(shown.map((item) => item.id)).toEqual(["r1", "r2"]);
  });
});
