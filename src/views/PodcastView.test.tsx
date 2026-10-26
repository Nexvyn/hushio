import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, getPodcast } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  getPodcast: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("../lib/podcasts", () => ({ getPodcast }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

vi.mock("../lib/theme", () => ({ applyTheme: () => {} }));

import { PodcastView } from "./PodcastView";
import type { PodcastEpisode, PodcastPage } from "../lib/podcastParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const ART = "https://lh3.googleusercontent.com/a=s544";

function episode(id: string, title: string): PodcastEpisode {
  return {
    id,
    title,
    artist: "Host A",
    thumb: ART,
    episode: true,
    duration: 0,
    album: "Show A",
    published: "Oct 12",
    description: `About ${title}`,
  };
}

const page: PodcastPage = {
  id: "MPSPa",
  title: "Show A",
  author: "Host A",
  thumb: ART,
  description: "A show about things.",
  episodes: [episode("ep2", "Newest"), episode("ep1", "Older")],
};

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useNavigation.setState({ view: { name: "podcast", param: "MPSPa" }, navPast: [], navFuture: [] });
  usePlayer.setState({ queue: [], index: 0, playing: false, played: [] });
});

afterEach(() => {
  cleanup();
});

describe("PodcastView", () => {
  it("shows the show header and episodes in the order given, newest first", async () => {
    getPodcast.mockResolvedValue(page);
    render(<PodcastView />);
    expect(await screen.findByRole("heading", { level: 1, name: "Show A" })).toBeTruthy();
    expect(screen.getByText("Podcast")).toBeTruthy();
    expect(screen.getByText("Host A")).toBeTruthy();
    expect(screen.getByText("A show about things.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Episodes" })).toBeTruthy();
    const rows = screen.getAllByRole("button", { name: /Newest|Older/ }).map((button) => button.textContent ?? "");
    expect(rows[0]).toContain("Newest");
    expect(rows[1]).toContain("Older");
    expect(getPodcast).toHaveBeenCalledWith("MPSPa");
  });

  it("plays only the latest episode from Play latest episode", async () => {
    getPodcast.mockResolvedValue(page);
    render(<PodcastView />);
    await userEvent.click(await screen.findByRole("button", { name: "Play latest episode" }));
    await waitFor(() => expect(playStream).toHaveBeenCalledWith("ep2", "Newest"));
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["ep2"]);
  });

  it("plays the episode whose row is clicked", async () => {
    getPodcast.mockResolvedValue(page);
    render(<PodcastView />);
    await userEvent.click(await screen.findByRole("button", { name: /Older/ }));
    await waitFor(() => expect(playStream).toHaveBeenCalledWith("ep1", "Older"));
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["ep1"]);
  });

  it("marks only the playing episode's row with the equaliser", async () => {
    getPodcast.mockResolvedValue(page);
    usePlayer.setState({ queue: [page.episodes[1]], index: 0, playing: true });
    render(<PodcastView />);
    const row = await screen.findByRole("button", { name: /Older/ });
    expect(row.querySelector('[role="img"][aria-label="Playing"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /Newest/ }).querySelector('[role="img"]')).toBeNull();
  });

  it("says there are no episodes when the list is empty", async () => {
    getPodcast.mockResolvedValue({ ...page, episodes: [] });
    render(<PodcastView />);
    expect(await screen.findByText("No episodes to play yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play latest episode" })).toBeNull();
  });

  it("shows the error state and retries the load", async () => {
    getPodcast.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page);
    render(<PodcastView />);
    expect(await screen.findByRole("heading", { name: "This podcast didn't load" })).toBeTruthy();
    expect(screen.getByText("Give it another try.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Show A" })).toBeTruthy();
    expect(getPodcast).toHaveBeenCalledTimes(2);
  });

  it("shows skeletons, not the header, while the show loads", () => {
    getPodcast.mockReturnValue(new Promise(() => {}));
    render(<PodcastView />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Episodes" })).toBeNull();
  });
});
