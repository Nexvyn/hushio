import { dailyRotation } from "./seeded";
import { artistKeyOf, artistsInLine } from "./taste";
import type { ArtistBundle } from "./artistBundle";
import type { CardRef, SideRef } from "./feed";
import type { Track } from "../types";

export const SIDE_LETTERS = ["A", "B", "C", "D"] as const;
const MIX_LENGTH = 30;
const MIX_MIN = 10;
const PER_ARTIST = 4;
const FRESH_EVERY = 4;
const NAMES_SHOWN = 3;
const THUMBS_SHOWN = 4;

type SideMember = { key: string; name: string; artistId: string | null };

export type SideMixInput = {
  members: readonly SideMember[];
  letter: string;
  own: readonly Track[];
  theirs: readonly Track[];
  neighbours: readonly Track[];
  hidden: ReadonlySet<string>;
  daySeed: number;
};

export function captionWith(names: readonly string[]): string {
  const [first, second, third] = names;
  if (first === undefined) return "";
  if (second === undefined) return `With ${first}`;
  if (third === undefined) return `With ${first} and ${second}`;
  return `With ${first}, ${second} and ${third}`;
}

export function namesLine(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function artistCaption(relatedNames: readonly string[], fallback: string): string {
  return captionWith(relatedNames.slice(0, NAMES_SHOWN)) || fallback;
}

function belongsTo(track: Track, keys: ReadonlySet<string>): boolean {
  return artistsInLine(track.artist).some((key) => keys.has(key)) || keys.has(artistKeyOf(track.artist));
}

export function sideMix({ members, letter, own, theirs, neighbours, hidden, daySeed }: SideMixInput): SideRef | null {
  const keys = new Set(members.map((member) => member.key));
  const seed = `side-${[...keys].sort().join("+")}`;
  const familiar = [
    ...dailyRotation(own.filter((track) => belongsTo(track, keys)), `${seed}-yours`, daySeed),
    ...dailyRotation(theirs, `${seed}-theirs`, daySeed),
  ];
  const fresh = dailyRotation(neighbours, `${seed}-new`, daySeed);
  const pools = { familiar, fresh };
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();

  const take = (pool: Track[]): Track | null => {
    for (;;) {
      const track = pool.shift();
      if (track === undefined) return null;
      const artist = artistKeyOf(track.artist);
      if (seen.has(track.id) || hidden.has(track.id) || (perArtist.get(artist) ?? 0) >= PER_ARTIST) continue;
      seen.add(track.id);
      perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
      return track;
    }
  };

  const mix: Track[] = [];
  let newOnes = 0;
  while (mix.length < MIX_LENGTH) {
    const wantNew = mix.length % FRESH_EVERY === FRESH_EVERY - 1;
    const primary = wantNew ? pools.fresh : pools.familiar;
    const backup = wantNew ? pools.familiar : pools.fresh;
    const first = take(primary);
    const track = first ?? take(backup);
    if (!track) break;
    mix.push(track);
    if (first ? wantNew : !wantNew) newOnes += 1;
  }
  if (mix.length < MIX_MIN) return null;

  const thumbs = [...new Set(mix.map((track) => track.thumb).filter((thumb): thumb is string => thumb !== null))];
  const names = members.map((member) => member.name);
  return {
    id: `${seed}-${letter}`,
    letter,
    caption: namesLine(names.slice(0, NAMES_SHOWN)),
    thumbs: thumbs.slice(0, THUMBS_SHOWN),
    count: mix.length,
    fresh: newOnes,
    source: { type: "tracks", tracks: mix, label: `Side ${letter}` },
  };
}

export function artistMixCard(
  artist: { artistId: string; name: string; thumb: string | null },
  bundle: ArtistBundle | null,
): CardRef {
  const name = `${artist.name} Mix`;
  return {
    style: "mix",
    id: `${artist.artistId}-mix`,
    name,
    thumb: bundle?.thumb ?? artist.thumb,
    caption: artistCaption(bundle?.related.map((related) => related.name) ?? [], artist.name),
    source: { type: "artist-mix", artistId: artist.artistId, name },
  };
}

export function radioCard(
  id: string,
  artist: { artistId: string; name: string; thumb: string | null },
  bundle: ArtistBundle | null,
): CardRef {
  const name = `${artist.name} Radio`;
  return {
    style: "radio",
    id,
    name: artist.name,
    thumb: bundle?.thumb ?? artist.thumb,
    caption: artistCaption(bundle?.related.map((related) => related.name) ?? [], "Radio"),
    source: { type: "artist-radio", artistId: artist.artistId, name },
  };
}
