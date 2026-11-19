import { topArtist, type RowEntry } from "./collections";

export type LibrarySort = "recents" | "added" | "alpha" | "creator" | "custom";

export const LIBRARY_SORTS: { id: LibrarySort; label: string }[] = [
  { id: "recents", label: "Recents" },
  { id: "added", label: "Recently added" },
  { id: "alpha", label: "Alphabetical" },
  { id: "creator", label: "Creator" },
  { id: "custom", label: "Custom order" },
];

const LAST = Number.MAX_SAFE_INTEGER;

function recentKeyOf(entry: RowEntry): string | null {
  if (entry.kind === "playlist") return `playlist:${entry.playlist.id}`;
  if (entry.kind === "artist") return `artist:${entry.artist.id}`;
  if (entry.kind === "album") return `album:${entry.album.id}`;
  return null;
}

function titleOf(entry: RowEntry): string {
  switch (entry.kind) {
    case "single":
      return entry.single;
    case "playlist":
      return entry.playlist.name;
    case "folder":
      return entry.folder.name;
    case "artist":
      return entry.artist.name;
    case "album":
      return entry.album.title;
  }
}

function creatorOf(entry: RowEntry): string {
  if (entry.kind === "artist") return entry.artist.name;
  if (entry.kind === "album") return entry.album.artist;
  if (entry.kind === "playlist") return topArtist(entry.playlist.tracks) ?? "";
  return "";
}

function addedRank(entry: RowEntry, playlistIndex: Map<string, number>): number {
  if (entry.kind === "artist") return -entry.artist.followedAt;
  if (entry.kind === "album") return -entry.album.savedAt;
  if (entry.kind === "playlist") return playlistIndex.get(entry.playlist.id) ?? LAST;
  return LAST;
}

export function sortLibraryRows(
  rows: RowEntry[],
  sort: LibrarySort,
  recentIndex: Map<string, number>,
  playlistIndex: Map<string, number>,
): RowEntry[] {
  if (sort === "custom") return rows;
  const alpha = (a: RowEntry, b: RowEntry) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: "base", numeric: true });
  const sorted = [...rows];
  switch (sort) {
    case "recents":
      return sorted.sort((a, b) => {
        const ka = recentKeyOf(a);
        const kb = recentKeyOf(b);
        return (ka ? recentIndex.get(ka) ?? LAST : LAST) - (kb ? recentIndex.get(kb) ?? LAST : LAST);
      });
    case "added":
      return sorted.sort((a, b) => addedRank(a, playlistIndex) - addedRank(b, playlistIndex));
    case "alpha":
      return sorted.sort(alpha);
    case "creator":
      return sorted.sort((a, b) => creatorOf(a).localeCompare(creatorOf(b), undefined, { sensitivity: "base" }) || alpha(a, b));
  }
}
