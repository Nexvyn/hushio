import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browseMenuItems } from "./browseActions";
import { getAlbumPage } from "./browse";
import type { BrowseItem, SearchSong } from "./searchParse";
import { usePlayer } from "../stores/player";
import { type MenuItem, useUI } from "../stores/ui";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("./audio", () => ({
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

vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

vi.mock("./browse", () => ({
  getAlbumPage: vi.fn(),
  getPlaylistPage: vi.fn(),
}));

const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();

const item = (type: BrowseItem["type"], browseId: string, subtitle = ""): BrowseItem => ({
  type,
  browseId,
  title: "Thing",
  subtitle,
  thumb: null,
});

function itemNamed(items: MenuItem[], label: string): MenuItem {
  const found = items.find((entry) => entry.label === label);
  if (!found) throw new Error(`no menu item named ${label}`);
  return found;
}

const song: SearchSong = {
  id: "s1",
  title: "Song",
  artist: "Band",
  thumb: null,
  artistId: null,
  albumId: null,
  album: null,
  duration: 0,
  explicit: false,
  isVideo: false,
};

beforeEach(() => {
  usePlayer.setState(initialPlayer, true);
  useUI.setState({ ...initialUI, toasts: [], pendingToasts: [] }, true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("browse artist menu (PRD 32.10.1 J)", () => {
  it("opens the artist and copies the channel link", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const items = browseMenuItems(item("artist", "UCabc"));

    expect(items.filter((entry) => !entry.subject).map((entry) => entry.label)).toEqual(["Open artist", "Copy link"]);
    itemNamed(items, "Copy link").onSelect?.();

    expect(writeText).toHaveBeenCalledWith("https://music.youtube.com/channel/UCabc");
  });

  it("uses the round artwork subject", () => {
    const subject = browseMenuItems(item("artist", "UCabc")).find((entry) => entry.subject)?.subject;

    expect(subject).toMatchObject({ subtitle: "Artist", round: true });
  });
});

describe("browse album and playlist menu (PRD 32.10.1 J)", () => {
  it("lists play, queue, a disabled Download all, and copy link for an album", () => {
    const items = browseMenuItems(item("album", "MPREx"));

    expect(items.filter((entry) => !entry.subject).map((entry) => entry.label)).toEqual([
      "Play",
      "Play next",
      "Add to queue",
      "Download all",
      "Save to Your Library",
      "Copy link",
    ]);
    expect(itemNamed(items, "Download all").disabled).toBeFalsy();
  });

  it("copies the album and playlist links to their YouTube Music pages", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    itemNamed(browseMenuItems(item("album", "MPREx")), "Copy link").onSelect?.();
    itemNamed(browseMenuItems(item("playlist", "PLx")), "Copy link").onSelect?.();

    expect(writeText).toHaveBeenNthCalledWith(1, "https://music.youtube.com/browse/MPREx");
    expect(writeText).toHaveBeenNthCalledWith(2, "https://music.youtube.com/playlist?list=PLx");
  });

  it("queues the album's songs next once they load", async () => {
    const addToQueue = vi.fn(() => 1);
    usePlayer.setState({ addToQueue });
    vi.mocked(getAlbumPage).mockResolvedValue({ tracks: [song] } as Awaited<ReturnType<typeof getAlbumPage>>);

    itemNamed(browseMenuItems(item("album", "MPREx")), "Play next").onSelect?.();

    await vi.waitFor(() => expect(addToQueue).toHaveBeenCalledWith([song], true));
  });

  it("says so when the songs cannot be loaded", async () => {
    vi.mocked(getAlbumPage).mockRejectedValue(new Error("offline"));

    itemNamed(browseMenuItems(item("album", "MPREx")), "Add to queue").onSelect?.();

    await vi.waitFor(() =>
      expect(useUI.getState().toasts.at(-1)).toMatchObject({ message: "Couldn't load those songs", kind: "error" }),
    );
  });

});
