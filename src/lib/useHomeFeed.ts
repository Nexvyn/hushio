import { useEffect, useMemo, useState } from "react";
import { getArtistBundle } from "./artistBundle";
import { hiddenNow, tapsNow } from "./engagement";
import type { HomeShelf } from "./home";
import type { MoodEntry } from "./moods";
import { loadMoods } from "./explore";
import { replayJournal, replaySummary } from "./bridge";
import { type FeedSection, buildHomeSections } from "./feed";
import { dayBucket } from "./seeded";
import { computeTasteProfile, type JournalEntry, type StatsSummary, type TasteProfile } from "./taste";
import { peekArtistMeta } from "../stores/artistMeta";
import { useArtistBundles } from "../stores/artistBundles";
import { useHomeEngagement } from "../stores/homeEngagement";
import { useLibrary } from "../stores/library";
import { useRecents } from "../stores/recents";
import { useSettings } from "../stores/settings";
import type { Track } from "../types";

const STATS_REFRESH_MS = 120_000;
const FOCUS_LATELY = 2;
const FOCUS_TOP = 6;
const NO_SHELVES: readonly HomeShelf[] = [];
const EMPTY_SUMMARY: StatsSummary = { plays: 0, artists: [], tracks: [], hours: [] };

type Stats = { all: StatsSummary; month: StatsSummary; journal: JournalEntry[] };

async function loadStats(): Promise<Stats | null> {
  try {
    const [all, month, journal] = await Promise.all([replaySummary("all"), replaySummary("month"), replayJournal()]);
    return { all, month, journal };
  } catch (error) {
    console.warn(`[hushio] stats load failed: ${String(error)}`);
    return null;
  }
}

function focusArtistIds(profile: TasteProfile): string[] {
  const lately = profile.lately.slice(0, FOCUS_LATELY).map((artist) => artist.artistId);
  const top = profile.artists.slice(0, FOCUS_TOP).map((artist) => artist.artistId);
  return [...new Set([...lately, ...top])].flatMap((id) => (id === null ? [] : [id]));
}

function durationsOf(tracks: readonly (Track & { duration?: number })[]): Record<string, number> {
  return Object.fromEntries(
    tracks.flatMap((track) => (track.duration && track.duration > 0 ? [[track.id, track.duration] as const] : [])),
  );
}

export function useHomeFeed(shelves: readonly HomeShelf[] = NO_SHELVES): FeedSection[] {
  const [stats, setStats] = useState<Stats | null>(null);
  const [moods, setMoods] = useState<readonly MoodEntry[]>([]);
  const history = useLibrary((state) => state.history);
  const liked = useLibrary((state) => state.liked);
  const playlists = useLibrary((state) => state.playlists);
  const followed = useLibrary((state) => state.followedArtists);
  const searches = useRecents((state) => state.searches);
  const taps = useHomeEngagement((state) => state.taps);
  const hiddenTracks = useHomeEngagement((state) => state.hiddenTracks);
  const hiddenArtists = useHomeEngagement((state) => state.hiddenArtists);
  const dontRepeat = useSettings((state) => state.dontRepeatSuggestions);
  const bundles = useArtistBundles((state) => state.bundles);
  const day = dayBucket();

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadStats().then((next) => {
        if (active && next) setStats(next);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, STATS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadMoods().then((next) => {
      if (active) setMoods(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const playedTracks = useMemo(() => history.filter((track) => !track.episode), [history]);
  const likedTracks = useMemo(() => liked.filter((track) => !track.episode), [liked]);
  const playlistTracks = useMemo(() => playlists.flatMap((playlist) => playlist.tracks), [playlists]);

  const profile = useMemo(
    () =>
      computeTasteProfile({
        all: stats?.all ?? EMPTY_SUMMARY,
        month: stats?.month ?? EMPTY_SUMMARY,
        history: playedTracks,
        liked: likedTracks,
        playlists: playlistTracks,
        searches,
        skips: {},
        followed: followed.map((artist) => ({ id: artist.id, name: artist.name, thumb: artist.thumb })),
        journal: stats?.journal ?? [],
        hiddenArtists,
        durations: durationsOf([...playedTracks, ...likedTracks, ...playlistTracks]),
        now: Date.now(),
        resolveArtist: (name) => {
          const meta = peekArtistMeta(name);
          return meta ? { artistId: meta.id, thumb: meta.thumb } : null;
        },
      }),
    [stats, playedTracks, likedTracks, playlistTracks, searches, followed, hiddenArtists, day],
  );

  const focusKey = focusArtistIds(profile).join("|");
  useEffect(() => {
    if (focusKey === "") return;
    for (const artistId of focusKey.split("|")) void getArtistBundle(artistId);
  }, [focusKey]);

  return useMemo(
    () =>
      buildHomeSections({
        profile,
        bundles: new Map(Object.entries(bundles)),
        shelves,
        moods,
        hidden: hiddenNow(hiddenTracks, Date.now()),
        taps: tapsNow(taps, Date.now()),
        dontRepeat,
        now: Date.now(),
      }),
    [profile, bundles, shelves, moods, hiddenTracks, taps, dontRepeat],
  );
}
