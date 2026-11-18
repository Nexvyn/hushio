import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  historyMenuItems,
  playerAddMenuItems,
  playAlbumVersion,
  playlistTrackMenuItems,
  songOf,
  trackMenuItems,
} from "./trackActions";
import type { SearchSong } from "./searchParse";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useSongInfo } from "../stores/songInfo";
import { type MenuItem, useUI } from "../stores/ui";

const { matchSong, audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  matchSong: vi.fn(),
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("./importMatch", () => ({ matchSong }));

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

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();

const song: SearchSong = {
  id: "v1",
  title: "Night Drive",
  artist: "Band",
  thumb: "https://img.example/night.jpg",
  artistId: "UCband",
  albumId: "MPREalbum",
  album: "Album X",
  duration: 200,
  explicit: false,
  isVideo: false,
};

const libTrack: LibraryTrack = { id: "v1", title: "Night Drive", artist: "Band", thumb: null, album: "Album X", duration: 200, explicit: false };
const other: LibraryTrack = { id: "v2", title: "Other", artist: "Band", thumb: null, album: null, duration: 100, explicit: false };
const third: LibraryTrack = { id: "v3", title: "Third", artist: "Band", thumb: null, album: null, duration: 100, explicit: false };

function playlist(id: string, name: string, tracks: LibraryTrack[] = []): Playlist {
  return { id, name, folderId: null, pinned: false, tracks };
}

function labelsOf(items: MenuItem[]): string[] {
  return items.filter((item) => !item.subject).map((item) => item.label);
}

function itemNamed(items: MenuItem[], label: string): MenuItem {
  const found = items.find((item) => item.label === label);
  if (!found) throw new Error(`no menu item named ${label}`);
  return found;
}

function lastToastAction() {
  return useUI.getState().toasts.at(-1)?.action;
}

beforeEach(() => {
  matchSong.mockReset();
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useUI.setState({ ...initialUI, toasts: [], pendingToasts: [] }, true);
});

afterEach(() => {
  localStorage.removeItem("hushio.debugStream");
  vi.restoreAllMocks();
});

describe("track menu (PRD 32.10.1 A)", () => {
  it("lists the items in PRD order for a song with an artist, an album and two playlists", () => {
    useLibrary.setState({ playlists: [playlist("p1", "Mix"), playlist("p2", "Road")] });

    expect(labelsOf(trackMenuItems(song))).toEqual([
      "Play now",
      "Play next",
      "Add to queue",
      "Start radio",
      "Add to Liked Songs",
      'Add to "Mix"',
      'Add to "Road"',
      "Add to playlists",
      "New playlist",
      "Play album version",
      "Download",
      "Go to artist",
      "Go to album",
      "Share",
      "Song info",
      "Sleep timer",
    ]);
  });

  it("shows Copy log only when the debug stream flag is on", () => {
    expect(labelsOf(trackMenuItems(song))).not.toContain("Copy log");

    localStorage.setItem("hushio.debugStream", "1");

    expect(labelsOf(trackMenuItems(song))).toContain("Copy log");
  });

  it("hides Play now for the song that is playing", () => {
    usePlayer.setState({ queue: [songOf(song)], index: 0 });

    expect(labelsOf(trackMenuItems(song))).not.toContain("Play now");
    expect(labelsOf(trackMenuItems({ ...song, id: "other" }))).toContain("Play now");
  });

  it("shows Remove from Liked Songs for a liked song", () => {
    useLibrary.setState({ liked: [libTrack] });

    expect(labelsOf(trackMenuItems(song))).toContain("Remove from Liked Songs");
  });

  it("caps the playlist shortcuts at six and still offers Add to playlists", () => {
    useLibrary.setState({
      playlists: Array.from({ length: 8 }, (_, index) => playlist(`p${index}`, `List ${index}`)),
    });

    const labels = labelsOf(trackMenuItems(song));
    expect(labels.filter((label) => label.startsWith('Add to "'))).toHaveLength(6);
    expect(labels).toContain("Add to playlists");
  });

  it("leaves out Download, Share and Start radio for a local song", () => {
    const local: SearchSong = { ...song, id: "local:file-1", artistId: null, albumId: null };

    const labels = labelsOf(trackMenuItems(local));
    expect(labels).not.toContain("Download");
    expect(labels).not.toContain("Share");
    expect(labels).not.toContain("Start radio");
    expect(labels).toContain("Song info");
    expect(labels).not.toContain("Go to artist");
    expect(labels).not.toContain("Go to album");
  });

  it("offers Download and an enabled Sleep timer submenu", () => {
    const items = trackMenuItems(song);
    const sleep = itemNamed(items, "Sleep timer");

    expect(itemNamed(items, "Download").disabled).toBeFalsy();
    expect(sleep.disabled).toBeFalsy();
    expect(labelsOf(sleep.children ?? [])).toEqual([
      "5 minutes",
      "15 minutes",
      "30 minutes",
      "45 minutes",
      "1 hour",
      "2 hours",
      "End of this song",
      "Custom",
    ]);
  });

  it("drops Download and offers no folder item once the song is saved", () => {
    useLibrary.setState({
      downloads: {
        [song.id]: {
          track: { id: song.id, title: song.title, artist: song.artist, duration: 0 },
          path: "/music/Hushio/a.m4a",
          status: "done",
          progress: 1,
          downloaded: 0,
          total: 0,
        },
      },
    });
    const items = trackMenuItems(song);

    expect(items.some((item) => item.label === "Download")).toBe(false);
    expect(items.some((item) => item.label === "Show in folder")).toBe(false);
    useLibrary.setState({ downloads: {} });
  });

  it("puts Go to album under its own separator only when there is no artist item", () => {
    expect(itemNamed(trackMenuItems(song), "Go to album").separatorBefore).toBe(false);
    expect(itemNamed(trackMenuItems({ ...song, artistId: null }), "Go to album").separatorBefore).toBe(true);
  });

  it("copies the YouTube Music link when the system share sheet is unavailable", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

    itemNamed(trackMenuItems(song), "Share").onSelect?.();

    expect(writeText).toHaveBeenCalledWith("https://music.youtube.com/watch?v=v1");
  });

  it("shares the title, artist and link through the system share sheet", () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });

    itemNamed(trackMenuItems(song), "Share").onSelect?.();

    expect(share).toHaveBeenCalledWith({
      title: "Night Drive",
      text: "Night Drive by Band",
      url: "https://music.youtube.com/watch?v=v1",
    });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("starts radio from the song", () => {
    const startRadio = vi.fn().mockResolvedValue(undefined);
    usePlayer.setState({ startRadio });

    itemNamed(trackMenuItems(song), "Start radio").onSelect?.();

    expect(startRadio).toHaveBeenCalledWith(song);
  });

  it("opens the song info sheet for the song", () => {
    itemNamed(trackMenuItems(song), "Song info").onSelect?.();

    expect(useSongInfo.getState().song).toEqual(song);
    useSongInfo.getState().close();
  });

  it("queues the song next and says so", () => {
    const addToQueue = vi.fn(() => 1);
    usePlayer.setState({ addToQueue });

    itemNamed(trackMenuItems(song), "Play next").onSelect?.();

    expect(addToQueue).toHaveBeenCalledWith([song], true);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("Playing next");
  });

  it("says Already in your queue when the song is already queued", () => {
    usePlayer.setState({ addToQueue: vi.fn(() => 0) });

    itemNamed(trackMenuItems(song), "Add to queue").onSelect?.();

    expect(useUI.getState().toasts.at(-1)?.message).toBe("Already in your queue");
  });

  it("ends with the subject row that lights the menu", () => {
    const subject = trackMenuItems(song).find((item) => item.subject)?.subject;

    expect(subject).toEqual({ title: "Night Drive", subtitle: "Band", thumb: song.thumb });
  });

  it("builds a song from a plain track with empty extras", () => {
    expect(songOf({ id: "x", title: "T", artist: "A", thumb: null })).toMatchObject({
      album: null,
      artistId: null,
      albumId: null,
      duration: 0,
      isVideo: false,
    });
  });
});

describe("recently played menu (PRD 32.10.1 G)", () => {
  it("removes the song from Recently played and offers Undo that puts it back", () => {
    useLibrary.setState({ history: [libTrack] });

    itemNamed(historyMenuItems(libTrack), "Remove from Recently played").onSelect?.();
    expect(useLibrary.getState().history).toEqual([]);

    lastToastAction()?.run();
    expect(useLibrary.getState().history.map((item) => item.id)).toEqual(["v1"]);
  });

  it("starts with the removal and then the track list", () => {
    const items = historyMenuItems(libTrack);

    expect(items[0].label).toBe("Remove from Recently played");
    expect(items[0].danger).toBe(true);
    expect(labelsOf(items).slice(1)).toContain("Play now");
  });
});

describe("playlist song menu (PRD 32.10.1 B)", () => {
  beforeEach(() => {
    useLibrary.setState({ playlists: [playlist("p1", "Road", [libTrack, other, third])] });
  });

  it("disables the moves that would run past either end", () => {
    const items = playlistTrackMenuItems(useLibrary.getState().playlists[0], 0);

    expect(itemNamed(items, "Move up").disabled).toBe(true);
    expect(itemNamed(items, "Move to top").disabled).toBe(true);
    expect(itemNamed(items, "Move down").disabled).toBe(false);
    expect(itemNamed(items, "Move to bottom").disabled).toBe(false);
  });

  it("drops the moves for a one-song playlist", () => {
    useLibrary.setState({ playlists: [playlist("p1", "Solo", [libTrack])] });

    expect(labelsOf(playlistTrackMenuItems(useLibrary.getState().playlists[0], 0))).not.toContain("Move down");
  });

  it("removes the song and offers Undo that restores it at its place", () => {
    const current = useLibrary.getState().playlists[0];

    itemNamed(playlistTrackMenuItems(current, 1), "Remove from this playlist").onSelect?.();
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["v1", "v3"]);

    lastToastAction()?.run();
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["v1", "v2", "v3"]);
  });
});

describe("player plus menu (PRD 32.1)", () => {
  it("lists the liked toggle, then Add to playlist with one tick per playlist and New playlist", () => {
    useLibrary.setState({
      playlists: [playlist("p1", "Mix", [libTrack]), playlist("p2", "Road")],
    });

    const items = playerAddMenuItems(song);
    expect(labelsOf(items)).toEqual(["Add to Liked Songs", "Add to playlist"]);

    const children = itemNamed(items, "Add to playlist").children ?? [];
    expect(children.map((child) => [child.label, child.checked])).toEqual([
      ["Mix", true],
      ["Road", false],
      ["New playlist", undefined],
    ]);
    expect(children[2].separatorBefore).toBe(true);
  });

  it("removes a ticked song from its playlist and offers Undo", () => {
    useLibrary.setState({ playlists: [playlist("p1", "Mix", [libTrack])] });

    const mix = itemNamed(playerAddMenuItems(song), "Add to playlist").children?.[0];
    mix?.onSelect?.();
    expect(useLibrary.getState().playlists[0].tracks).toEqual([]);

    lastToastAction()?.run();
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["v1"]);
  });

  it("adds an unticked song to its playlist and reports it", () => {
    useLibrary.setState({ playlists: [playlist("p2", "Road")] });

    itemNamed(playerAddMenuItems(song), "Add to playlist").children?.[0].onSelect?.();

    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["v1"]);
    expect(useUI.getState().toasts.at(-1)?.message).toBe('Added to "Road"');
  });
});


describe("album recording playback", () => {
  it("finds a song without matching the video's longer duration", async () => {
    const match = { ...song, id: "album-audio", isVideo: false };
    matchSong.mockResolvedValueOnce(match);
    const play = vi.spyOn(usePlayer.getState(), "playTrack");
    await playAlbumVersion(song);
    expect(matchSong).toHaveBeenCalledWith({ title: song.title, artist: song.artist, album: song.album, duration: 0 }, "");
    expect(play).toHaveBeenCalledWith(match);
  });

  it("leaves playback unchanged when no matching recording exists", async () => {
    matchSong.mockResolvedValueOnce(null);
    const play = vi.spyOn(usePlayer.getState(), "playTrack");
    await playAlbumVersion(song);
    expect(play).not.toHaveBeenCalled();
    expect(useUI.getState().toasts.some(item => item.message.includes("No matching album recording"))).toBe(true);
  });
});


describe("album lookup races", () => {
  it("ignores an older lookup that completes after a newer selection", async () => {
    let finishFirst!: (value: SearchSong) => void;
    let finishSecond!: (value: SearchSong) => void;
    matchSong.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
    const play = vi.spyOn(usePlayer.getState(), "playTrack");
    const first = playAlbumVersion({ ...song, id: "first-request" });
    const second = playAlbumVersion({ ...song, id: "second-request" });
    await vi.waitFor(() => expect(matchSong).toHaveBeenCalledTimes(2));
    const newer = { ...song, id: "newer-audio" };
    finishSecond(newer);
    await second;
    finishFirst({ ...song, id: "older-audio" });
    await first;
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(newer);
  });

  it("does not interrupt playback changed while a lookup is pending", async () => {
    let finish!: (value: SearchSong) => void;
    matchSong.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const play = vi.spyOn(usePlayer.getState(), "playTrack");
    const pending = playAlbumVersion({ ...song, id: "pending-request" });
    await vi.waitFor(() => expect(matchSong).toHaveBeenCalledOnce());
    usePlayer.setState({ queue: [{ ...song, id: "chosen-song" }], index: 0 });
    finish({ ...song, id: "late-audio" });
    await pending;
    expect(play).not.toHaveBeenCalled();
  });
});
