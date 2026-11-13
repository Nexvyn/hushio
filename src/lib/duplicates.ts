import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";

export type Place = { kind: "liked" } | { kind: "playlist"; playlistId: string; name: string };

export type Copy = { place: Place; track: LibraryTrack };

export type DuplicateGroup = {
  key: string;
  kind: "exact" | "likely";
  copies: Copy[];
};

export type Duplicates = { exact: DuplicateGroup[]; likely: DuplicateGroup[] };

const SUFFIX = /\s+-\s+.*\b(remaster(ed)?|live|official|lyrics?|version|edit|mix|mono|stereo|deluxe|radio|explicit|clean|demo)\b.*$/i;
const BRACKETS = /\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g;

export function normalizeTitle(title: string): string {
  return title
    .replace(BRACKETS, " ")
    .replace(SUFFIX, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizeArtist(artist: string): string {
  return artist.toLowerCase().replace(/\s+/g, " ").trim();
}

function placeKey(place: Place): string {
  return place.kind === "liked" ? "liked" : `playlist:${place.playlistId}`;
}

function exactGroups(place: Place, tracks: readonly LibraryTrack[]): DuplicateGroup[] {
  const byId = new Map<string, Copy[]>();
  for (const track of tracks) {
    byId.set(track.id, [...(byId.get(track.id) ?? []), { place, track }]);
  }
  return [...byId.entries()]
    .filter(([, copies]) => copies.length > 1)
    .map(([id, copies]) => ({ key: `exact:${placeKey(place)}:${id}`, kind: "exact" as const, copies }));
}

function likelyGroups(liked: readonly LibraryTrack[]): DuplicateGroup[] {
  const byKey = new Map<string, Copy[]>();
  for (const track of liked) {
    const key = `${normalizeArtist(track.artist)}\u0000${normalizeTitle(track.title)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), { place: { kind: "liked" }, track }]);
  }
  return [...byKey.entries()]
    .filter(([, copies]) => new Set(copies.map((copy) => copy.track.id)).size > 1)
    .map(([key, copies]) => ({ key: `likely:${key}`, kind: "likely" as const, copies }));
}

export function findDuplicates(liked: readonly LibraryTrack[], playlists: readonly Playlist[]): Duplicates {
  const exact = [
    ...exactGroups({ kind: "liked" }, liked),
    ...playlists.flatMap((playlist) =>
      exactGroups({ kind: "playlist", playlistId: playlist.id, name: playlist.name }, playlist.tracks),
    ),
  ];
  return { exact, likely: likelyGroups(liked) };
}

export function placeLabel(place: Place): string {
  return place.kind === "liked" ? "Liked Songs" : place.name;
}

function keepFirstOf(tracks: readonly LibraryTrack[], ids: ReadonlySet<string>): LibraryTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!ids.has(track.id)) return true;
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export function keepExactCopies(groups: readonly DuplicateGroup[]) {
  const liked = new Set<string>();
  const byPlaylist = new Map<string, Set<string>>();
  for (const group of groups) {
    if (group.kind !== "exact") continue;
    const [first] = group.copies;
    if (first.place.kind === "liked") {
      liked.add(first.track.id);
      continue;
    }
    const ids = byPlaylist.get(first.place.playlistId) ?? new Set<string>();
    ids.add(first.track.id);
    byPlaylist.set(first.place.playlistId, ids);
  }
  if (liked.size > 0) {
    useLibrary.getState().setLikedTracks(keepFirstOf(useLibrary.getState().liked, liked));
  }
  for (const [playlistId, ids] of byPlaylist) {
    const playlist = useLibrary.getState().playlists.find((item) => item.id === playlistId);
    if (playlist) useLibrary.getState().setPlaylistTracks(playlistId, keepFirstOf(playlist.tracks, ids));
  }
}

export function keepOne(group: DuplicateGroup) {
  if (group.kind === "exact") {
    keepExactCopies([group]);
    return;
  }
  const library = useLibrary.getState();
  const [first] = group.copies;
  const extras = new Map<string, LibraryTrack>();
  for (const copy of group.copies) {
    if (copy.track.id !== first.track.id && !extras.has(copy.track.id)) extras.set(copy.track.id, copy.track);
  }
  for (const track of extras.values()) library.toggleLike(track);
}
