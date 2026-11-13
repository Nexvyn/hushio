import { TEST_SONG_ID } from "./devSong";
import type { AlbumRef, ArtistBundle, ArtistRef } from "./artistBundle";
import { learnedBoost } from "./engagement";
import type { HomeShelf } from "./home";
import type { MoodEntry } from "./moods";
import type { PlaySource } from "./playQueue";
import { artistMixCard, radioCard, sideMix, SIDE_LETTERS } from "./mixes";
import { clusterSides, type Side, type SideArtist } from "./sides";
import { dailyRotation } from "./seeded";
import { artistKeyOf, artistsInLine, rankByTaste, type ArtistScore, type TasteProfile } from "./taste";
import type { Track } from "../types";

const PINNED: ReadonlySet<SectionKind> = new Set<SectionKind>(["jump-back-in", "playlists-for-you", "browse"]);
const MAX_SECTIONS = 10;
const LEARNED_CAP = 93;
const CRATE_MIN = 6;
const CRATE_TAG = "RDCLAK5uy_";
const TOP_ARTISTS = 6;
const SIDE_ARTISTS = 8;
const MORE_LIKE_ANCHORS = 2;
const HOUR_MS = 3_600_000;
const COLD_SLOTS = 3;
const WARM_SLOTS = 2;
const MIX_ROW_ARTIST_CAP = 4;

export type SectionKind =
  | "jump-back-in"
  | "playlists-for-you"
  | "browse"
  | "your-mixes"
  | "heavy-rotation"
  | "favorite-artists"
  | "more-like"
  | "recommended-today"
  | "new-from-your-artists"
  | "dust-off"
  | "stations"
  | "albums-for-you"
  | "because"
  | "market";

export type SectionLayout = "tiles" | "row" | "circles" | "mixes" | "radios" | "yt-shelf" | "moods" | "crate" | "list";

export type PlaylistRef = { id: string; title: string; subtitle: string; thumb: string | null };

export type CardRef = {
  style: "mix" | "radio";
  id: string;
  name: string;
  thumb: string | null;
  caption: string;
  source: PlaySource;
};

export type SideRef = {
  id: string;
  letter: string;
  caption: string;
  thumbs: string[];
  count: number;
  fresh: number;
  source: PlaySource;
};

export type SectionItem =
  | { kind: "track"; track: Track; note?: string }
  | { kind: "album"; album: AlbumRef }
  | { kind: "artist"; artist: ArtistRef }
  | { kind: "playlist"; playlist: PlaylistRef }
  | { kind: "card"; card: CardRef }
  | { kind: "side"; side: SideRef };

export type Eyebrow = { label: string; name?: string; thumb?: string | null; artistId?: string | null };

export type FeedSection = {
  id: string;
  kind: SectionKind;
  title: string;
  subtitle?: string;
  eyebrow?: Eyebrow;
  anchorKey?: string;
  layout: SectionLayout;
  priority: number;
  items: SectionItem[];
  shelf?: HomeShelf;
  moods?: MoodEntry[];
  playlists?: PlaylistRef[];
};

export type FeedInput = {
  profile: TasteProfile;
  bundles: ReadonlyMap<string, ArtistBundle>;
  shelves: readonly HomeShelf[];
  moods: readonly MoodEntry[];
  hidden: ReadonlySet<string>;
  taps: Readonly<Record<string, number>>;
  dontRepeat: boolean;
  now: number;
};

type IdentifiedArtist = ArtistScore & { artistId: string };
type Built = Omit<FeedSection, "kind" | "priority">;
type Descriptor = { kind: SectionKind; priority: number; minItems: number; build: () => Built | null };

type Ctx = {
  profile: TasteProfile;
  bundles: ReadonlyMap<string, ArtistBundle>;
  shelves: readonly HomeShelf[];
  moods: readonly MoodEntry[];
  hidden: ReadonlySet<string>;
  blocked: ReadonlySet<string>;
  now: number;
  usedTracks: Set<string>;
  usedAlbums: Set<string>;
  top: IdentifiedArtist[];
  anchors: IdentifiedArtist[];
  maxScore: number;
  cold: boolean;
  light: boolean;
};

function isIdentified(artist: ArtistScore): artist is IdentifiedArtist {
  return artist.artistId !== null;
}

function identifiedOf(artists: readonly ArtistScore[]): IdentifiedArtist[] {
  return artists.filter(isIdentified);
}

function monthYear(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function hourAwareTodayTitle(now: number): string {
  const hour = new Date(now).getHours();
  if (hour < 5) return "Late night picks";
  if (hour < 12) return "Picks for your morning";
  if (hour < 17) return "Recommended for today";
  if (hour < 22) return "Recommended for tonight";
  return "Late night picks";
}

export function cratePlaylists(shelves: readonly HomeShelf[]): PlaylistRef[] {
  const seen = new Set<string>();
  const playlists: PlaylistRef[] = [];
  for (const shelf of shelves) {
    for (const item of shelf.items) {
      if (item.kind !== "playlist" || seen.has(item.id)) continue;
      seen.add(item.id);
      playlists.push({ id: item.id, title: item.title, subtitle: item.subtitle, thumb: item.thumb });
    }
  }
  return [
    ...playlists.filter((playlist) => playlist.id.includes(CRATE_TAG)),
    ...playlists.filter((playlist) => !playlist.id.includes(CRATE_TAG)),
  ];
}

export function tasteAffinity(artists: readonly ArtistScore[]): Map<string, number> {
  const top = Math.max(1e-9, ...artists.map((artist) => artist.score));
  const affinity = new Map<string, number>();
  for (const artist of artists) {
    if (artist.score <= 0) continue;
    for (const key of artistsInLine(artist.name)) {
      affinity.set(key, Math.max(affinity.get(key) ?? 0, artist.score / top));
    }
  }
  return affinity;
}

function relatedSongPool(ctx: Ctx, bundle: ArtistBundle): Track[] {
  return bundle.related.flatMap((related) => ctx.bundles.get(related.id)?.topSongs ?? []);
}

function takeTracks(
  ctx: Ctx,
  pool: readonly Track[],
  { count, maxPerArtist = 3, unplayedOnly }: { count: number; maxPerArtist?: number; unplayedOnly: boolean },
): Track[] {
  const taken: Track[] = [];
  const perArtist = new Map<string, number>();
  for (const track of pool) {
    if (taken.length >= count) break;
    if (ctx.usedTracks.has(track.id) || ctx.blocked.has(track.id)) continue;
    if (unplayedOnly && ctx.profile.playedTrackIds.has(track.id)) continue;
    const artist = artistKeyOf(track.artist);
    if ((perArtist.get(artist) ?? 0) >= maxPerArtist) continue;
    perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
    ctx.usedTracks.add(track.id);
    taken.push(track);
  }
  return taken;
}

function takeAlbums(ctx: Ctx, albums: readonly AlbumRef[], max: number): AlbumRef[] {
  const taken: AlbumRef[] = [];
  for (const album of albums) {
    if (taken.length >= max) break;
    if (ctx.usedAlbums.has(album.id)) continue;
    ctx.usedAlbums.add(album.id);
    taken.push(album);
  }
  return taken;
}

function trackItems(tracks: readonly Track[]): SectionItem[] {
  return tracks.map((track): SectionItem => ({ kind: "track", track }));
}

function artistItems(artists: readonly ArtistRef[]): SectionItem[] {
  return artists.map((artist): SectionItem => ({ kind: "artist", artist }));
}

function albumItems(albums: readonly AlbumRef[]): SectionItem[] {
  return albums.map((album): SectionItem => ({ kind: "album", album }));
}

function sideRefs(ctx: Ctx, sides: readonly Side[]): SideRef[] {
  const refs: SideRef[] = [];
  sides.forEach((side, index) => {
    const memberIds = new Set(side.members.map((member) => member.artistId));
    const theirs = side.members.flatMap((member) => ctx.bundles.get(member.artistId ?? "")?.topSongs ?? []);
    const neighbours = side.members.flatMap((member) =>
      (ctx.bundles.get(member.artistId ?? "")?.related ?? [])
        .filter((item) => !memberIds.has(item.id))
        .flatMap((item) => ctx.bundles.get(item.id)?.topSongs ?? []),
    );
    const own = [
      ...ctx.profile.heavyRotation.map((row) => row.track),
      ...ctx.profile.recentlyPlayed,
      ...ctx.profile.liked,
    ];
    const neighbourFresh = neighbours.filter((track) => !ctx.profile.playedTrackIds.has(track.id));
    const mix = sideMix({
      members: side.members,
      letter: SIDE_LETTERS[index] ?? String(index),
      own,
      theirs,
      neighbours: neighbourFresh,
      hidden: ctx.blocked,
      daySeed: ctx.profile.daySeed,
    });
    if (mix) refs.push(mix);
  });
  return refs;
}

function describeFeed(ctx: Ctx): Descriptor[] {
  const { profile, top, anchors, maxScore, now } = ctx;
  const out: Descriptor[] = [];
  const lastPlayed = Math.max(-Infinity, ...profile.artists.flatMap((artist) => (artist.lastPlayedAt === null ? [] : [artist.lastPlayedAt])));
  const hoursSincePlay = lastPlayed === -Infinity ? Infinity : (now - lastPlayed) / HOUR_MS;

  if (profile.recentlyPlayed.filter((track) => track.id !== TEST_SONG_ID).length >= 4) {
    out.push({
      kind: "jump-back-in",
      priority: 95 + (hoursSincePlay < 8 ? 5 : 0),
      minItems: 3,
      build: () => ({
        id: "jump-back-in",
        title: "Jump back in",
        layout: "tiles",
        items: trackItems(profile.recentlyPlayed.filter((track) => !ctx.hidden.has(track.id) && track.id !== TEST_SONG_ID).slice(0, 6)),
      }),
    });
  }

  const crate = rankByTaste(cratePlaylists(ctx.shelves), tasteAffinity(profile.artists));
  const crated = crate.length >= CRATE_MIN;
  if (crated) {
    out.push({
      kind: "playlists-for-you",
      priority: 94,
      minItems: 0,
      build: () => ({ id: "playlists-for-you", title: "Playlists for you", layout: "crate", items: [], playlists: crate }),
    });
  }

  if (ctx.cold && ctx.moods.length > 0) {
    out.push({
      kind: "browse",
      priority: 90,
      minItems: 0,
      build: () => ({
        id: "browse",
        title: "Browse",
        subtitle: "Common searches to get you started",
        layout: "moods",
        items: [],
        moods: ctx.moods.slice(0, 8),
      }),
    });
  }

  if (top.length >= 2) {
    out.push({
      kind: "your-mixes",
      priority: 88,
      minItems: 2,
      build: () => {
        const sideArtists: SideArtist[] = identifiedOf(profile.artists)
          .slice(0, SIDE_ARTISTS)
          .map((artist) => ({ key: artist.key, artistId: artist.artistId, name: artist.name, score: artist.score }));
        const related = (artistId: string) => ctx.bundles.get(artistId)?.related.map((item) => item.id) ?? [];
        const sides = clusterSides(sideArtists, related, profile.pairs);
        const sideItems = sideRefs(ctx, sides).map((side): SectionItem => ({ kind: "side", side }));
        const inSide = new Set(sides.flatMap((side) => side.members.map((member) => member.key)));
        const artistMixes = top
          .filter((artist) => !inSide.has(artist.key))
          .slice(0, Math.max(0, MIX_ROW_ARTIST_CAP - sideItems.length))
          .map((artist): SectionItem => ({
            kind: "card",
            card: artistMixCard(artist, ctx.bundles.get(artist.artistId) ?? null),
          }));
        return {
          id: "your-mixes",
          title: "Your mixes",
          subtitle:
            sides.length > 0 ? "One for each side of your taste, with a few new songs in each" : undefined,
          layout: "mixes",
          items: [...sideItems, ...artistMixes].slice(0, MIX_ROW_ARTIST_CAP),
        };
      },
    });
  }

  if (profile.heavyRotation.length >= 4) {
    out.push({
      kind: "heavy-rotation",
      priority: 84,
      minItems: 4,
      build: () => ({
        id: "heavy-rotation",
        title: "Heavy rotation",
        subtitle: "What you keep coming back to",
        layout: "list",
        items: profile.heavyRotation
          .filter((row) => !ctx.hidden.has(row.track.id))
          .slice(0, 16)
          .map((row) => ({
            kind: "track" as const,
            track: row.track,
            note: `${row.listens} ${row.listens === 1 ? "play" : "plays"} lately`,
          })),
      }),
    });
  }

  if (top.length >= 3) {
    out.push({
      kind: "favorite-artists",
      priority: 64 + (profile.maturity === "strong" ? 6 : 0),
      minItems: 3,
      build: () => ({
        id: "favorite-artists",
        title: "Your favorite artists",
        layout: "circles",
        items: artistItems(
          top.slice(0, 8).map((artist) => ({
            id: artist.artistId,
            name: artist.name,
            thumb: ctx.bundles.get(artist.artistId)?.thumb ?? artist.thumb,
          })),
        ),
      }),
    });
  }

  anchors.slice(0, MORE_LIKE_ANCHORS).forEach((anchor, index) => {
    const bundle = ctx.bundles.get(anchor.artistId);
    if (!bundle) return;
    out.push({
      kind: "more-like",
      priority: 56 + 24 * Math.min(1, Math.max(0, anchor.score / maxScore)) - index * 4,
      minItems: 3,
      build: () => {
        const related = bundle.related.slice(0, 3);
        const album = takeAlbums(ctx, bundle.albums, 1);
        return {
          id: `more-like-${anchor.key}`,
          title: anchor.name,
          eyebrow: { label: "More like", name: anchor.name, thumb: anchor.thumb ?? bundle.thumb, artistId: anchor.artistId },
          anchorKey: anchor.key,
          layout: "row",
          items: [
            { kind: "card", card: radioCard(`${anchor.artistId}-radio`, anchor, bundle) },
            ...artistItems(related),
            ...albumItems(album),
          ],
        };
      },
    });
  });

  if (anchors.length >= 1) {
    out.push({
      kind: "recommended-today",
      priority: 62 + Math.round(8 * profile.hourEnergy),
      minItems: 3,
      build: () => {
        const pool = anchors
          .slice(0, TOP_ARTISTS)
          .flatMap((anchor) => {
            const bundle = ctx.bundles.get(anchor.artistId);
            return bundle ? dailyRotation(relatedSongPool(ctx, bundle), anchor.artistId, profile.daySeed) : [];
          });
        const tracks = takeTracks(ctx, pool, { count: 12, maxPerArtist: 2, unplayedOnly: true });
        return {
          id: "recommended-today",
          title: hourAwareTodayTitle(now),
          subtitle: "New to you, close to what you're playing lately",
          anchorKey: anchors[0].key,
          layout: "row",
          items: trackItems(tracks),
        };
      },
    });
  }

  out.push({
    kind: "new-from-your-artists",
    priority: 66,
    minItems: 3,
    build: () => {
      const year = new Date(now).getFullYear() - 1;
      const releases = anchors
        .slice(0, 8)
        .flatMap((anchor) => ctx.bundles.get(anchor.artistId)?.albums ?? [])
        .filter((album) => album.year !== null && Number(album.year) >= year)
        .sort((a, b) => Number(b.year) - Number(a.year));
      return {
        id: "new-from-your-artists",
        title: "New from your artists",
        subtitle: "Fresh releases from the artists you play",
        layout: "row",
        items: albumItems(takeAlbums(ctx, releases, 10)),
      };
    },
  });

  if (profile.dustOff.length >= 4) {
    out.push({
      kind: "dust-off",
      priority: 58,
      minItems: 4,
      build: () => ({
        id: "dust-off",
        title: "Dust these off",
        subtitle: "Songs you loved and haven't played in a while",
        layout: "list",
        items: profile.dustOff
          .filter((row) => !ctx.hidden.has(row.track.id))
          .slice(0, 16)
          .map((row) => ({ kind: "track" as const, track: row.track, note: `Last played ${monthYear(row.lastAt)}` })),
      }),
    });
  }

  if (top.length >= 2 && profile.maturity !== "light") {
    out.push({
      kind: "stations",
      priority: 50,
      minItems: 2,
      build: () => ({
        id: "stations",
        title: "Recommended stations",
        subtitle: "Non-stop music based on your favorite songs and artists.",
        layout: "radios",
        items: top.slice(0, 4).map((artist) => ({
          kind: "card" as const,
          card: radioCard(`${artist.artistId}-station`, artist, ctx.bundles.get(artist.artistId) ?? null),
        })),
      }),
    });
  }

  if (top.length >= 2) {
    out.push({
      kind: "albums-for-you",
      priority: 46,
      minItems: 3,
      build: () => ({
        id: "albums-for-you",
        title: "Albums featuring songs you like",
        layout: "row",
        items: albumItems(
          takeAlbums(
            ctx,
            top.flatMap((artist) => ctx.bundles.get(artist.artistId)?.albums ?? []),
            8,
          ),
        ),
      }),
    });
  }

  if (anchors.length >= 3) {
    const anchor = anchors[2];
    out.push({
      kind: "because",
      priority: 42,
      minItems: 3,
      build: () => {
        const bundle = ctx.bundles.get(anchor.artistId);
        const pool = bundle ? dailyRotation(relatedSongPool(ctx, bundle), anchor.artistId, profile.daySeed) : [];
        return {
          id: `because-${anchor.key}`,
          title: `Because you listened to ${anchor.name}`,
          eyebrow: { label: "Because you listened to", name: anchor.name, thumb: anchor.thumb, artistId: anchor.artistId },
          anchorKey: anchor.key,
          layout: "row",
          items: trackItems(takeTracks(ctx, pool, { count: 8, maxPerArtist: 2, unplayedOnly: true })),
        };
      },
    });
  }

  const slots = ctx.cold || ctx.light ? COLD_SLOTS : WARM_SLOTS;
  const crateTitles = crated ? ctx.shelves.filter((shelf) => !shelf.items.every((item) => item.kind === "playlist")) : ctx.shelves;
  crateTitles.slice(0, slots).forEach((shelf, index) => {
    out.push({
      kind: "market",
      priority: ctx.cold || ctx.light ? 60 - index : 24 - index,
      minItems: 0,
      build: () => ({
        id: `yt-${index}-${shelf.title}`,
        title: shelf.title,
        layout: "yt-shelf",
        items: [],
        shelf,
      }),
    });
  });

  return out;
}

function contentLength(section: Built): number {
  return (
    section.items.length + (section.playlists?.length ?? 0) + (section.moods?.length ?? 0) + (section.shelf?.items.length ?? 0)
  );
}

export function diversify(sections: FeedSection[]): FeedSection[] {
  const out = [...sections];
  for (let i = 1; i < out.length; i++) {
    const key = out[i].anchorKey;
    if (key === undefined || key !== out[i - 1].anchorKey) continue;
    const target = out.findIndex((section, index) => index > i && section.anchorKey !== key);
    if (target < 0) continue;
    const [moved] = out.splice(i, 1);
    out.splice(target, 0, moved);
    return out;
  }
  return out;
}

function contextOf(input: FeedInput): Ctx {
  const identified = identifiedOf(input.profile.artists);
  const top = identified.slice(0, TOP_ARTISTS);
  const lately = identifiedOf(input.profile.lately);
  const anchors = [...lately, ...top.filter((artist) => !lately.some((item) => item.key === artist.key))];
  const suggestionBlock = input.dontRepeat ? new Set([...input.hidden, ...input.profile.playedTrackIds]) : input.hidden;
  return {
    profile: input.profile,
    bundles: input.bundles,
    shelves: input.shelves,
    moods: input.moods,
    hidden: input.hidden,
    blocked: suggestionBlock,
    now: input.now,
    usedTracks: new Set(),
    usedAlbums: new Set(),
    top,
    anchors,
    maxScore: top[0]?.score ?? 1,
    cold: input.profile.maturity === "cold",
    light: input.profile.maturity === "light",
  };
}

export function buildHomeSections(input: FeedInput): FeedSection[] {
  const ctx = contextOf(input);
  const descriptors = describeFeed(ctx)
    .map((descriptor) => ({
      ...descriptor,
      priority: PINNED.has(descriptor.kind)
        ? descriptor.priority
        : Math.min(LEARNED_CAP, descriptor.priority + learnedBoost(input.taps[descriptor.kind] ?? 0)),
    }))
    .sort((a, b) => b.priority - a.priority);

  const sections: FeedSection[] = [];
  for (const descriptor of descriptors) {
    if (sections.length >= MAX_SECTIONS) break;
    const built = descriptor.build();
    if (!built || contentLength(built) < descriptor.minItems) continue;
    sections.push({ ...built, kind: descriptor.kind, priority: descriptor.priority });
  }
  return diversify(sections);
}
