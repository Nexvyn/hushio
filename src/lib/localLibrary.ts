import { platform, type LocalFolderEntry, type LocalTrack, type LocalUnplayable } from "./bridge";
import { APP_NAME } from "./app";
import { plural } from "./plural";
import type { Track } from "../types";
import type { DownloadItem } from "../stores/library";

export type LocalScope = { kind: "all" } | { kind: "opened" } | { kind: "folder"; path: string } | { kind: "network"; id: string };
export type LocalSort = "title" | "artist" | "recent";
export type LocalTab = "songs" | "albums" | "artists" | "folders";

export const LOCAL_ID_PREFIX = "local:";
const NETWORK_ID_PREFIX = "net:";

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

export function isNetworkId(id: string): boolean {
  return id.startsWith(NETWORK_ID_PREFIX);
}

export function artUrl(art: string | undefined, os: string = platform): string | null {
  if (!art) return null;
  if (/^https?:\/\//.test(art)) return art;
  const name = art.replace(/^localart:\/\//, "");
  return os === "windows" || os === "android" ? `http://localart.localhost/${name}` : `localart://localhost/${name}`;
}

export function networkTrackUrl(id: string, os: string = platform): string {
  const encoded = encodeURIComponent(id.replace(/^net:/, ""));
  return os === "windows" || os === "android" ? `http://netmusic.localhost/${encoded}` : `netmusic://localhost/${encoded}`;
}

export function toTrack(track: LocalTrack): Track {
  return { id: track.id, title: track.title, artist: track.artist, thumb: artUrl(track.art) };
}

function normal(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function isUnderPath(child: string, root: string): boolean {
  const base = normal(root);
  if (!base) return false;
  const target = normal(child);
  return target === base || target.startsWith(`${base}/`);
}

export function childPath(parent: string, name: string): string {
  const separator = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${name}`;
}

export function folderName(folder: LocalFolderEntry): string {
  return folder.displayName ?? folder.name;
}

function matchesSearch(track: LocalTrack, query: string): boolean {
  if (!query) return true;
  return [track.title, track.artist, track.album].some((value) => value.toLowerCase().includes(query));
}

export type DeviceFilter = "all" | "local" | "downloaded";

export function isDownloadedTrack(track: LocalTrack): boolean {
  return !isLocalId(track.id);
}

export function deviceTracks(tracks: LocalTrack[], downloads: DownloadItem[]): LocalTrack[] {
  const seen = new Set(tracks.map((track) => track.id));
  const saved: LocalTrack[] = [];
  for (const item of downloads) {
    if (item.status !== "done" || !item.path || seen.has(item.track.id)) continue;
    seen.add(item.track.id);
    saved.push({
      id: item.track.id,
      path: item.path,
      title: item.track.title,
      artist: item.track.artist,
      album: item.track.album || "Unknown album",
      duration: item.track.duration,
      size: 0,
      mtime: 0,
      art: item.track.thumb,
    });
  }
  return [...tracks, ...saved];
}

export function filterDevice(tracks: LocalTrack[], filter: DeviceFilter): LocalTrack[] {
  if (filter === "all") return tracks;
  const downloaded = filter === "downloaded";
  return tracks.filter((track) => isDownloadedTrack(track) === downloaded);
}

export function scopeTracks(
  tracks: LocalTrack[],
  opened: LocalTrack[],
  scope: LocalScope,
  query: string,
): LocalTrack[] {
  const base =
    scope.kind === "all"
      ? tracks
      : scope.kind === "opened"
        ? opened
        : scope.kind === "network"
          ? []
          : tracks.filter((track) => isUnderPath(track.path, scope.path));
  const needle = query.trim().toLowerCase();
  return base.filter((track) => matchesSearch(track, needle));
}

export function sortTracks(tracks: LocalTrack[], sort: LocalSort): LocalTrack[] {
  const copy = [...tracks];
  if (sort === "recent") return copy.sort((a, b) => b.mtime - a.mtime);
  if (sort === "artist") {
    return copy.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  }
  return copy.sort((a, b) => a.title.localeCompare(b.title));
}

export type AlbumGroup = { key: string; album: string; artist: string; count: number; art: string | null; tracks: LocalTrack[] };

export function albumGroups(tracks: LocalTrack[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    const key = `${track.album}|${track.artist}`;
    const group = groups.get(key) ?? { key, album: track.album, artist: track.artist, count: 0, art: null, tracks: [] };
    group.count += 1;
    group.tracks.push(track);
    group.art ??= artUrl(track.art);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.album.localeCompare(b.album));
}

export type ArtistGroup = { artist: string; count: number; art: string | null; tracks: LocalTrack[] };

export function artistGroups(tracks: LocalTrack[]): ArtistGroup[] {
  const groups = new Map<string, ArtistGroup>();
  for (const track of tracks) {
    const group = groups.get(track.artist) ?? { artist: track.artist, count: 0, art: null, tracks: [] };
    group.count += 1;
    group.tracks.push(track);
    group.art ??= artUrl(track.art);
    groups.set(track.artist, group);
  }
  return [...groups.values()].sort((a, b) => a.artist.localeCompare(b.artist));
}

export type FolderListing = {
  folders: { name: string; path: string; count: number }[];
  files: LocalTrack[];
};

export function folderListing(tracks: LocalTrack[], at: string): FolderListing {
  const root = at.replace(/\\/g, "/").replace(/\/+$/, "");
  const folders = new Map<string, { name: string; path: string; count: number }>();
  const files: LocalTrack[] = [];
  for (const track of tracks) {
    if (!isUnderPath(track.path, at)) continue;
    const segments = track.path.replace(/\\/g, "/").slice(root.length + 1).split("/");
    if (segments.length === 1) {
      files.push(track);
      continue;
    }
    const name = segments[0];
    const folder = folders.get(name) ?? { name, path: childPath(at, name), count: 0 };
    folder.count += 1;
    folders.set(name, folder);
  }
  const sorted = [...folders.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { folders: sorted, files };
}

export function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function unplayableToast(formats: string[]): string {
  return `${APP_NAME} can't play ${joinOr(formats)} files`;
}

export function leftOutText(unplayable: LocalUnplayable[]): string | null {
  const count = unplayable.reduce((sum, item) => sum + item.count, 0);
  if (count === 0) return null;
  const formats = unplayable.map((item) => item.format);
  return `${plural(count, "file", "files")} left out: ${APP_NAME} can't play ${joinOr(formats)} files.`;
}
