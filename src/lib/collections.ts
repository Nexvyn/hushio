import { upgradeArtwork } from "./artwork";
import { arrange } from "./libraryOrder";
import type { Folder, FollowedArtist, PinnedSingles, Playlist } from "../stores/library";

export const SINGLE_ROWS = ["liked", "spotify", "replay", "downloads", "local"] as const;
export type SingleRow = (typeof SINGLE_ROWS)[number];

export type RowEntry =
  | { key: string; kind: "single"; single: SingleRow }
  | { key: string; kind: "playlist"; playlist: Playlist }
  | { key: string; kind: "folder"; folder: Folder; count: number }
  | { key: string; kind: "artist"; artist: FollowedArtist };

export type RowsInput = {
  playlists: Playlist[];
  folders: Folder[];
  followedArtists: FollowedArtist[];
  pinnedSingles: PinnedSingles;
  libraryOrder: string[] | undefined;
};

export function coversOf(tracks: readonly { thumb: string | null }[], limit = Number.POSITIVE_INFINITY): string[] {
  return tracks
    .map((track) => upgradeArtwork(track.thumb))
    .filter((art) => art !== "")
    .slice(0, limit);
}

export function topArtist(tracks: readonly { artist: string }[]): string | null {
  const counts = new Map<string, number>();
  for (const track of tracks) counts.set(track.artist, (counts.get(track.artist) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [artist, count] of counts) {
    if (count > bestCount) {
      best = artist;
      bestCount = count;
    }
  }
  return best;
}

export function pinnedFirst<T>(items: readonly T[], isPinned: (item: T) => boolean): T[] {
  return [...items].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));
}

export function unfiledPlaylists(playlists: readonly Playlist[]): Playlist[] {
  return playlists.filter((playlist) => playlist.folderId === null);
}

export function playlistsIn(playlists: readonly Playlist[], folderId: string): Playlist[] {
  return playlists.filter((playlist) => playlist.folderId === folderId);
}

export function libraryRows(input: RowsInput): { fixed: RowEntry[]; movable: RowEntry[] } {
  const singles: { entry: RowEntry; pinned: boolean }[] = SINGLE_ROWS.map((single) => ({
    entry: { key: `single:${single}`, kind: "single", single },
    pinned: input.pinnedSingles[single],
  }));
  const playlists = unfiledPlaylists(input.playlists).map((playlist) => ({
    entry: { key: `playlist:${playlist.id}`, kind: "playlist", playlist } as RowEntry,
    pinned: playlist.pinned,
  }));
  const folders = input.folders.map((folder) => ({
    entry: {
      key: `folder:${folder.id}`,
      kind: "folder",
      folder,
      count: playlistsIn(input.playlists, folder.id).length,
    } as RowEntry,
    pinned: false,
  }));
  const artists = input.followedArtists.map((artist) => ({
    entry: { key: `artist:${artist.id}`, kind: "artist", artist } as RowEntry,
    pinned: false,
  }));

  const fixed = [...singles, ...playlists].filter((row) => row.pinned).map((row) => row.entry);
  const defaults = [...singles, ...playlists, ...folders, ...artists].filter((row) => !row.pinned);
  const byKey = new Map(defaults.map((row) => [row.entry.key, row.entry]));
  const movable = arrange([...byKey.keys()], input.libraryOrder ?? []).flatMap((key) => {
    const entry = byKey.get(key);
    return entry ? [entry] : [];
  });

  return { fixed, movable };
}
