import { ContextMenu } from "../components/ContextMenu";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { getAlbumPage } = vi.hoisted(() => ({ getAlbumPage: vi.fn() }));

vi.mock("../lib/browse", () => ({ getAlbumPage }));
vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
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

import { AlbumView } from "./AlbumView";
import type { ReleasePage } from "../lib/browseParse";
import type { SearchSong } from "../lib/searchParse";
import { useArtistMeta } from "../stores/artistMeta";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();
const playQueue = vi.fn();

function songs(count: number): SearchSong[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `a${index}`,
    title: `Track ${index}`,
    artist: "Nova",
    thumb: null,
    artistId: "UCnova",
    albumId: "MPREalb",
    album: "Night Drive",
    duration: 200,
    explicit: index === 0,
    isVideo: false,
  }));
}

function releasePage(overrides: Partial<ReleasePage["album"]> = {}, tracks = songs(2)): ReleasePage {
  return {
    kind: "album",
    album: {
      id: "MPREalb",
      title: "Night Drive (Deluxe)",
      artist: "Nova",
      year: "2023",
      thumb: null,
      releaseType: "Album",
      description: "Recorded in one night at the coast.",
      artistId: "UCnova",
      releaseDate: null,
      copyright: [],
      ...overrides,
    },
    tracks,
    continuation: null,
  };
}

function renderAlbum(page: ReleasePage) {
  getAlbumPage.mockResolvedValue(page);
  render(<><AlbumView /><ContextMenu /></>);
}

function mockClamp(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => scrollHeight });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => clientHeight });
}

beforeEach(() => {
  usePlayer.setState({ playQueue });
  useNavigation.setState({ view: { name: "album", param: "MPREalb" } });
  useArtistMeta.setState({ byName: {} });
  useUI.setState({ toasts: [] });
});

afterEach(() => {
  cleanup();
  usePlayer.setState(initialPlayer);
  playQueue.mockReset();
  getAlbumPage.mockReset();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

describe("AlbumView", () => {
  it("shows the short title, the full title as a tooltip and the artist", async () => {
    renderAlbum(releasePage());

    const heading = await screen.findByRole("heading", { level: 1, name: "Night Drive" });
    expect(heading.getAttribute("title")).toBe("Night Drive (Deluxe)");
    expect(screen.getByRole("button", { name: "Nova" })).toBeTruthy();
  });

  it("builds the meta line with the release type, year and track count", async () => {
    renderAlbum(releasePage({}, songs(1)));

    expect(await screen.findByText("Album · 2023 · 1 track")).toBeTruthy();
  });

  it("shows the From line when the title names a source", async () => {
    renderAlbum(releasePage({ title: 'Theme (From "Film Name")' }));

    expect(await screen.findByText("From Film Name")).toBeTruthy();
  });

  it("shows the about block and numbered rows", async () => {
    renderAlbum(releasePage());

    expect(await screen.findByRole("heading", { name: "About the album" })).toBeTruthy();
    expect(screen.getByText("Track 0")).toBeTruthy();
    expect(screen.getByText("Track 1")).toBeTruthy();
    expect(screen.getByLabelText("Explicit")).toBeTruthy();
  });

  it("plays from a clicked track with no source label", async () => {
    const user = userEvent.setup();
    const page = releasePage();
    renderAlbum(page);

    await user.click(await screen.findByText("Track 1"));

    expect(playQueue).toHaveBeenCalledWith(page.tracks, 1, undefined);
  });

  it("plays from the first track with Play and shuffles with Shuffle", async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const page = releasePage();
    renderAlbum(page);

    await user.click(await screen.findByRole("button", { name: "Play" }));
    expect(playQueue).toHaveBeenLastCalledWith(page.tracks, 0, undefined);

    await user.click(screen.getByRole("button", { name: "Shuffle" }));
    expect(usePlayer.getState().shuffle).toBe(true);
    expect(playQueue).toHaveBeenLastCalledWith(page.tracks, 1, undefined);
  });

  it("opens the artist from the artist button", async () => {
    const user = userEvent.setup();
    renderAlbum(releasePage());

    await user.click(await screen.findByRole("button", { name: "Nova" }));

    expect(useNavigation.getState().view).toEqual({ name: "artist", param: "UCnova" });
  });

  it("uses the remembered artist id when the album has none", async () => {
    const user = userEvent.setup();
    useArtistMeta.setState({
      byName: { nova: { id: "UCremembered", name: "Nova", thumb: null, resolvedAt: Date.now() } },
    });
    renderAlbum(releasePage({ artistId: null }));

    await user.click(await screen.findByRole("button", { name: "Nova" }));

    expect(useNavigation.getState().view).toEqual({ name: "artist", param: "UCremembered" });
  });

  it("disables Go to artist when no artist id is known", async () => {
    const user = userEvent.setup();
    renderAlbum(releasePage({ artistId: null }));

    await user.click(await screen.findByRole("button", { name: "More options" }));

    expect((screen.getByRole("menuitem", { name: "Go to artist" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("menuitem", { name: "Download all" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("toggles the about text between clipped and expanded", async () => {
    const user = userEvent.setup();
    mockClamp(120, 60);
    renderAlbum(releasePage());

    await user.click(await screen.findByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Less" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Less" }));
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  });

  it("hides the toggle when the text fits", async () => {
    mockClamp(40, 60);
    renderAlbum(releasePage());

    await screen.findByRole("heading", { name: "About the album" });
    expect(screen.queryByRole("button", { name: "More" })).not.toBeTruthy();
  });

  it("copies the album link and confirms", async () => {
    const user = userEvent.setup();
    renderAlbum(releasePage());

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("menuitem", { name: "Copy link" }));

    expect(await navigator.clipboard.readText()).toBe("https://music.youtube.com/browse/MPREalb");
    await vi.waitFor(() => expect(useUI.getState().toasts.map((toast) => toast.message)).toContain("Link copied"));
  });

  it("shows the error state and retries", async () => {
    const user = userEvent.setup();
    getAlbumPage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(releasePage());
    render(<><AlbumView /><ContextMenu /></>);

    expect(await screen.findByText("Couldn't load this album")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Night Drive" })).toBeTruthy();
  });
});
