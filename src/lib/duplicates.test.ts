import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const { rate, love, autoDownload } = vi.hoisted(() => ({
  rate: vi.fn(async () => {}),
  love: vi.fn(async () => {}),
  autoDownload: vi.fn(async () => {}),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  ytRate: rate,
  scrobbleLove: love,
}));

vi.mock("../lib/downloads", () => ({ autoDownloadLiked: autoDownload }));

import { findDuplicates, keepExactCopies, keepOne, normalizeArtist, normalizeTitle } from "./duplicates";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";

const initialLibrary = useLibrary.getState();

const song = (id: string, title: string, artist = "Artist"): LibraryTrack => ({
  id,
  title,
  artist,
  thumb: null,
  album: null,
  duration: 200,
  explicit: false,
});

const playlist = (id: string, name: string, tracks: LibraryTrack[]): Playlist => ({
  id,
  name,
  folderId: null,
  pinned: false,
  tracks,
});

const ids = (tracks: readonly LibraryTrack[]) => tracks.map((track) => track.id);

beforeEach(() => {
  vi.clearAllMocks();
  useLibrary.setState(initialLibrary, true);
});

afterEach(() => {
  useLibrary.setState(initialLibrary, true);
});

describe("normalizeTitle", () => {
  it("lowercases, strips brackets and remaster suffixes, and collapses spaces", () => {
    expect(normalizeTitle("  Hello   World (Official Video) ")).toBe("hello world");
    expect(normalizeTitle("Hello [Lyrics]")).toBe("hello");
    expect(normalizeTitle("Hello - Remastered 2011")).toBe("hello");
    expect(normalizeTitle("Hello, World!")).toBe("hello world");
  });

  it("keeps non-Latin letters", () => {
    expect(normalizeTitle("夜に駆ける (Official)")).toBe("夜に駆ける");
  });
});

describe("normalizeArtist", () => {
  it("ignores case and extra spaces", () => {
    expect(normalizeArtist("  The   Band ")).toBe("the band");
  });
});

describe("findDuplicates", () => {
  it("finds the same video id saved twice in one playlist as an exact duplicate", () => {
    const a = song("v1", "One");
    const groups = findDuplicates([], [playlist("p1", "Mix", [a, song("v2", "Two"), a])]);

    expect(groups.likely).toEqual([]);
    expect(groups.exact).toHaveLength(1);
    expect(groups.exact[0].copies.map((copy) => copy.track.id)).toEqual(["v1", "v1"]);
    expect(groups.exact[0].copies[0].place).toEqual({ kind: "playlist", playlistId: "p1", name: "Mix" });
  });

  it("groups Liked Songs with the same title and artist under different ids", () => {
    const liked = [
      song("a", "Blue Sky (Official Video)", "Sunny"),
      song("b", "Blue Sky - Remastered 2011", "sunny "),
      song("c", "Blue Sky [Lyrics]", "Sunny"),
      song("d", "Blue Sky", "Other Band"),
    ];
    const groups = findDuplicates(liked, []);

    expect(groups.exact).toEqual([]);
    expect(groups.likely).toHaveLength(1);
    expect(groups.likely[0].copies.map((copy) => copy.track.id)).toEqual(["a", "b", "c"]);
  });

  it("does not call songs by different artists duplicates", () => {
    const groups = findDuplicates([song("a", "Intro", "Band A"), song("b", "Intro", "Band B")], []);
    expect(groups.likely).toEqual([]);
  });
});

describe("keepOne", () => {
  it("unlikes the extra likely copies with toggleLike and keeps the first", () => {
    const toggleLike = vi.fn();
    const setLikedTracks = vi.fn();
    useLibrary.setState({ toggleLike, setLikedTracks });
    const liked = [
      song("a", "Blue Sky (Official Video)", "Sunny"),
      song("b", "Blue Sky - Remastered", "Sunny"),
      song("c", "Blue Sky [Lyrics]", "Sunny"),
    ];
    const [group] = findDuplicates(liked, []).likely;

    keepOne(group);

    expect(toggleLike.mock.calls.map(([track]) => track.id)).toEqual(["b", "c"]);
    expect(setLikedTracks).not.toHaveBeenCalled();
  });

  it("removes an exact playlist copy in one playlist update without remove or add actions", () => {
    const removeFromPlaylist = vi.fn();
    const addToPlaylist = vi.fn();
    const setPlaylistTracks = vi.fn(useLibrary.getState().setPlaylistTracks);
    useLibrary.setState({ removeFromPlaylist, addToPlaylist, setPlaylistTracks });
    const a = song("v1", "One");
    useLibrary.setState({ playlists: [playlist("p1", "Mix", [a, song("v2", "Two"), a])] });
    const [group] = findDuplicates([], useLibrary.getState().playlists).exact;

    keepOne(group);

    expect(removeFromPlaylist).not.toHaveBeenCalled();
    expect(addToPlaylist).not.toHaveBeenCalled();
    expect(setPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(ids(useLibrary.getState().playlists[0].tracks)).toEqual(["v1", "v2"]);
  });

  it("removes an exact liked copy without rating, scrobbling, downloading or toggling", () => {
    const toggleLike = vi.fn();
    useLibrary.setState({ toggleLike });
    const a = song("v1", "One");
    useLibrary.setState({ liked: [a, song("v2", "Two"), a] });
    const [group] = findDuplicates(useLibrary.getState().liked, []).exact;

    keepOne(group);

    expect(toggleLike).not.toHaveBeenCalled();
    expect(rate).not.toHaveBeenCalled();
    expect(love).not.toHaveBeenCalled();
    expect(autoDownload).not.toHaveBeenCalled();
    expect(ids(useLibrary.getState().liked)).toEqual(["v1", "v2"]);
  });
});

describe("keepExactCopies", () => {
  it("keeps the first position of each song in a playlist and writes the playlist once", () => {
    const setPlaylistTracks = vi.fn(useLibrary.getState().setPlaylistTracks);
    useLibrary.setState({ setPlaylistTracks });
    const v1 = song("v1", "One");
    const v2 = song("v2", "Two");
    const v3 = song("v3", "Three");
    useLibrary.setState({ playlists: [playlist("p1", "Mix", [v2, v1, v3, v1, v2])] });

    keepExactCopies(findDuplicates([], useLibrary.getState().playlists).exact);

    expect(setPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(ids(useLibrary.getState().playlists[0].tracks)).toEqual(["v2", "v1", "v3"]);
  });

  it("leaves every other playlist untouched", () => {
    const v1 = song("v1", "One");
    const v2 = song("v2", "Two");
    const other = playlist("p2", "Other", [v2, v1]);
    useLibrary.setState({ playlists: [playlist("p1", "Mix", [v1, v2, v1]), other] });

    keepExactCopies(findDuplicates([], useLibrary.getState().playlists).exact);

    const [mix, untouched] = useLibrary.getState().playlists;
    expect(ids(mix.tracks)).toEqual(["v1", "v2"]);
    expect(untouched).toBe(other);
  });

  it("removes exact liked copies in one liked update, keeping the first position", () => {
    const setLikedTracks = vi.fn(useLibrary.getState().setLikedTracks);
    const toggleLike = vi.fn();
    useLibrary.setState({ setLikedTracks, toggleLike });
    const v1 = song("v1", "One");
    useLibrary.setState({ liked: [v1, song("v2", "Two"), v1, song("v3", "Three")] });

    keepExactCopies(findDuplicates(useLibrary.getState().liked, []).exact);

    expect(setLikedTracks).toHaveBeenCalledTimes(1);
    expect(toggleLike).not.toHaveBeenCalled();
    expect(rate).not.toHaveBeenCalled();
    expect(love).not.toHaveBeenCalled();
    expect(autoDownload).not.toHaveBeenCalled();
    expect(ids(useLibrary.getState().liked)).toEqual(["v1", "v2", "v3"]);
  });

  it("does not touch likely groups", () => {
    const setLikedTracks = vi.fn();
    const toggleLike = vi.fn();
    useLibrary.setState({ setLikedTracks, toggleLike });
    const liked = [song("a", "Blue Sky (Official Video)", "Sunny"), song("b", "Blue Sky - Remastered", "Sunny")];

    keepExactCopies(findDuplicates(liked, []).likely);

    expect(setLikedTracks).not.toHaveBeenCalled();
    expect(toggleLike).not.toHaveBeenCalled();
  });
});
