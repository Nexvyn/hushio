import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, loadPodcasts, freshPodcasts } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  loadPodcasts: vi.fn(),
  freshPodcasts: vi.fn(),
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

vi.mock("../lib/podcasts", () => ({ loadPodcasts, freshPodcasts }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

vi.mock("../lib/theme", () => ({ applyTheme: () => {} }));

import { PodcastsView } from "./PodcastsView";
import type { PodcastEpisode, PodcastShelf } from "../lib/podcastParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const ART = "https://lh3.googleusercontent.com/a=s544";

const episode: PodcastEpisode = {
  id: "ep1",
  title: "Episode one",
  artist: "Host A",
  thumb: ART,
  episode: true,
  duration: 300,
  album: "Show A",
  published: "Oct 12",
  description: null,
};

const shelves: PodcastShelf[] = [
  {
    title: "Popular shows",
    shows: [
      { id: "MPSPa", title: "Show A", thumb: ART, author: "Host A" },
      { id: "MPSPb", title: "Show B", thumb: null, author: null },
    ],
    episodes: [],
  },
  { title: "Top episodes", shows: [], episodes: [episode] },
];

beforeEach(() => {
  vi.clearAllMocks();
  freshPodcasts.mockReturnValue(null);
  playStream.mockResolvedValue(undefined);
  useNavigation.setState({ view: { name: "podcasts" }, navPast: [], navFuture: [] });
  usePlayer.setState({ queue: [], index: 0, playing: false, played: [] });
});

afterEach(() => {
  cleanup();
});

describe("PodcastsView", () => {
  it("shows two skeleton shelves while the shelves load", () => {
    loadPodcasts.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PodcastsView />);
    expect(screen.getByRole("heading", { level: 1, name: "Podcasts" })).toBeTruthy();
    expect(container.querySelectorAll(".motion-safe\\:animate-pulse")).toHaveLength(2);
  });

  it("says the podcasts could not load when there is nothing to show", async () => {
    loadPodcasts.mockResolvedValue([]);
    render(<PodcastsView />);
    expect(await screen.findByText("Podcasts couldn't be loaded right now. Try again in a moment.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lists each shelf with its shows, falling back to the Podcast subtitle", async () => {
    loadPodcasts.mockResolvedValue(shelves);
    render(<PodcastsView />);
    expect(await screen.findByRole("heading", { level: 2, name: "Popular shows" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Top episodes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Show A/ }).textContent).toContain("Host A");
    expect(screen.getByRole("button", { name: /Show B/ }).textContent).toContain("Podcast");
  });

  it("opens the podcast page when a show is clicked", async () => {
    loadPodcasts.mockResolvedValue(shelves);
    render(<PodcastsView />);
    await userEvent.click(await screen.findByRole("button", { name: /Show A/ }));
    expect(useNavigation.getState().view).toEqual({ name: "podcast", param: "MPSPa" });
  });

  it("plays only the clicked episode", async () => {
    loadPodcasts.mockResolvedValue(shelves);
    render(<PodcastsView />);
    await userEvent.click(await screen.findByRole("button", { name: /Episode one/ }));
    await waitFor(() => expect(playStream).toHaveBeenCalledWith("ep1", "Episode one"));
    expect(usePlayer.getState().queue).toEqual([episode]);
    expect(useNavigation.getState().view).toEqual({ name: "podcasts" });
  });

  it("renders the cached shelves at once and refreshes them in the background", async () => {
    freshPodcasts.mockReturnValue(shelves);
    loadPodcasts.mockResolvedValue([{ title: "Newer", shows: [], episodes: [episode] }]);
    render(<PodcastsView />);
    expect(screen.getByRole("heading", { level: 2, name: "Popular shows" })).toBeTruthy();
    expect(await screen.findByRole("heading", { level: 2, name: "Newer" })).toBeTruthy();
  });
});
