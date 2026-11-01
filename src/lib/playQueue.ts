import type { ArtistBundle } from "./artistBundle";
import { hash32, seededShuffle } from "./queue";
import type { Track } from "../types";

export const ARTIST_MIX_SIZE = 30;
export const RADIO_SIZE = 40;
const RADIO_RELATED = 4;
const RADIO_PER_ARTIST = 4;
const SEED_RUN = 2;

export type PlaySource =
  | { type: "tracks"; tracks: Track[]; label: string }
  | { type: "artist-mix"; artistId: string; name: string }
  | { type: "artist-radio"; artistId: string; name: string }
  | { type: "album"; albumId: string; name: string }
  | { type: "yt-playlist"; playlistId: string; name: string };

export type PlayDeps = {
  bundle: (artistId: string) => Promise<ArtistBundle | null>;
  albumTracks: (albumId: string) => Promise<Track[]>;
  playlistTracks: (playlistId: string) => Promise<Track[]>;
  now: number;
};

export type ResolvedPlay = { tracks: Track[]; from: string };

export function dedupeTracks(tracks: readonly Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export function artistMixQueue(topSongs: readonly Track[], artistId: string, now: number): Track[] {
  return seededShuffle(dedupeTracks(topSongs), hash32(artistId) ^ now).slice(0, ARTIST_MIX_SIZE);
}

export function artistRadioQueue(
  seedSongs: readonly Track[],
  relatedSongs: readonly (readonly Track[])[],
  artistId: string,
  now: number,
): Track[] {
  const perArtist = new Map<string, number>();
  const extras: Track[] = [];
  for (const songs of relatedSongs) {
    for (const track of songs) {
      const count = perArtist.get(track.artist) ?? 0;
      if (count >= RADIO_PER_ARTIST) continue;
      perArtist.set(track.artist, count + 1);
      extras.push(track);
    }
  }
  const seeds = dedupeTracks(seedSongs);
  const shuffled = seededShuffle(extras, hash32(artistId) ^ now);
  const queue: Track[] = [];
  while (seeds.length > 0 || shuffled.length > 0) {
    queue.push(...seeds.splice(0, SEED_RUN));
    const extra = shuffled.shift();
    if (extra) queue.push(extra);
  }
  return dedupeTracks(queue).slice(0, RADIO_SIZE);
}

export async function resolvePlaySource(source: PlaySource, deps: PlayDeps): Promise<ResolvedPlay | null> {
  switch (source.type) {
    case "tracks": {
      const tracks = dedupeTracks(source.tracks);
      return tracks.length > 0 ? { tracks, from: source.label } : null;
    }
    case "artist-mix": {
      const bundle = await deps.bundle(source.artistId);
      if (!bundle || bundle.topSongs.length === 0) return null;
      const tracks = artistMixQueue(bundle.topSongs, source.artistId, deps.now);
      return { tracks, from: source.name };
    }
    case "artist-radio": {
      const bundle = await deps.bundle(source.artistId);
      if (!bundle || bundle.topSongs.length === 0) return null;
      const related = await Promise.all(
        bundle.related.slice(0, RADIO_RELATED).map((artist) => deps.bundle(artist.id)),
      );
      const relatedSongs = related.flatMap((found) => (found ? [found.topSongs] : []));
      const tracks = artistRadioQueue(bundle.topSongs, relatedSongs, source.artistId, deps.now);
      return { tracks, from: source.name };
    }
    case "album": {
      const tracks = dedupeTracks(await deps.albumTracks(source.albumId));
      return tracks.length > 0 ? { tracks, from: source.name } : null;
    }
    case "yt-playlist": {
      const tracks = dedupeTracks(await deps.playlistTracks(source.playlistId));
      return tracks.length > 0 ? { tracks, from: source.name } : null;
    }
  }
}

export function sourceLabel(source: PlaySource): string {
  return source.type === "tracks" ? source.label : source.name;
}
