import type { LocalTrack } from "./bridge";
import { searchAddon } from "./addons/client";
import { enabledAddons } from "./addons/registry";
import type { AddonSource, AddonTrack } from "./addons/types";
import { scopeTracks, toTrack } from "./localLibrary";
import type { SearchSong } from "./searchParse";

export type SearchScope = "online" | "device" | "addons";

const ADDON_ID_PREFIX = "addon:";

export function isAddonTrackId(id: string): boolean {
  return id.startsWith(ADDON_ID_PREFIX);
}

export function addonsAvailable(sources: readonly AddonSource[]): boolean {
  return enabledAddons(sources).length > 0;
}

function songOf(base: { id: string; title: string; artist: string; thumb: string | null }, album: string | null, duration: number): SearchSong {
  return { ...base, album, duration, artistId: null, albumId: null, explicit: false, isVideo: false };
}

export function deviceSongs(tracks: LocalTrack[], query: string): SearchSong[] {
  return scopeTracks(tracks, [], { kind: "all" }, query).map((track) =>
    songOf(toTrack(track), track.album || null, track.duration),
  );
}

function addonSongOf(source: AddonSource, track: AddonTrack): SearchSong {
  return songOf(
    { id: `${ADDON_ID_PREFIX}${source.id}:${track.id}`, title: track.title, artist: track.artist, thumb: null },
    null,
    track.durationSec ?? 0,
  );
}

export async function searchAddons(sources: readonly AddonSource[], query: string): Promise<SearchSong[]> {
  const needle = query.trim();
  const ordered = enabledAddons(sources);
  if (!needle || ordered.length === 0) return [];
  const results = await Promise.allSettled(
    ordered.map((source) => searchAddon(source, needle).then((tracks) => tracks.map((track) => addonSongOf(source, track)))),
  );
  if (results.every((result) => result.status === "rejected")) throw new Error("Every add-on search failed");
  const seen = new Set<string>();
  const songs: SearchSong[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const song of result.value) {
      if (seen.has(song.id)) continue;
      seen.add(song.id);
      songs.push(song);
    }
  }
  return songs;
}
