import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PlayIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { EqBars } from "../components/EqBars";
import { Icon } from "../components/Icon";
import { PILL } from "../components/BrowseHero";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { Artwork } from "../components/SearchRows";
import { openMenuAtPointer, openMenuFromKey } from "../components/ContextMenu";
import { browseMenuItems } from "../lib/browseActions";
import { trackMenuItems } from "../lib/trackActions";
import { freshMoods, getMoodCovers, loadMoods } from "../lib/explore";
import { useCovers } from "../lib/exploreCovers";
import { fmtTime } from "../lib/format";
import { FALLBACK_MOODS, MOOD_BROWSE_ID, moodByParams, type MoodEntry } from "../lib/moods";
import {
  loadMix,
  loadMoodPage,
  peekMoodPage,
  type MoodCardItem,
  type MoodPage,
} from "../lib/moodPage";
import type { BrowseType, SearchSong } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { currentTrack, usePlayer } from "../stores/player";

const UP_FIRST = 10;
const WALL_FIRST = 15;

type Lists = {
  songs: SearchSong[];
  playlists: MoodCardItem[];
  albums: MoodCardItem[];
  artists: MoodCardItem[];
};

function uniqueBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function listsOf(page: MoodPage | null | undefined): Lists {
  const items = page?.shelves.flatMap((shelf) => shelf.items) ?? [];
  return {
    songs: uniqueBy(
      items.flatMap((item) => (item.track ? [item.track] : [])),
      (song) => song.id,
    ),
    playlists: uniqueBy(
      items.flatMap((item) => (item.playlist ? [item.playlist] : [])),
      (card) => card.id,
    ),
    albums: uniqueBy(
      items.flatMap((item) => (item.album ? [item.album] : [])),
      (card) => card.id,
    ),
    artists: uniqueBy(
      items.flatMap((item) => (item.artist ? [item.artist] : [])),
      (card) => card.id,
    ),
  };
}

function BrowseCard({
  item,
  type,
  round = false,
  onOpen,
}: {
  item: MoodCardItem;
  type: BrowseType;
  round?: boolean;
  onOpen: () => void;
}) {
  const menu = () => browseMenuItems({ type, browseId: item.id, title: item.title, subtitle: item.subtitle, thumb: item.thumb });
  return (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={(event) => openMenuAtPointer(event, menu)}
      onKeyDown={(event) => void openMenuFromKey(event, menu)}
      className="flex w-[148px] shrink-0 flex-col gap-2 rounded-[12px] p-1.5 text-left hover:bg-wash active:bg-pressed motion-safe:transition-colors"
    >
      <Artwork src={item.thumb} round={round} size="h-[136px] w-[136px]" />
      <span className="block w-full min-w-0">
        <span className="block truncate text-[13px] font-medium text-ink-1">{item.title}</span>
        <span className="block truncate text-[12px] text-ink-2">{item.subtitle}</span>
      </span>
    </button>
  );
}

function Shelf({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mt-7">
      <SectionHeader title={title} count={count} />
      {children}
    </section>
  );
}

export function MoodView() {
  const param = useNavigation((state) => state.view.param) ?? "";
  const navigate = useNavigation((state) => state.navigate);
  const [moods, setMoods] = useState<MoodEntry[]>(() => freshMoods() ?? FALLBACK_MOODS);
  const [page, setPage] = useState<MoodPage | null | undefined>(() => peekMoodPage(param));
  const [mix, setMix] = useState<SearchSong[]>([]);
  const [mixing, setMixing] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const playing = usePlayer((state) => state.playing);
  const current = usePlayer((state) => currentTrack(state)?.id);
  const playQueue = usePlayer((state) => state.playQueue);

  const mood = moodByParams(moods, param);
  const lists = useMemo(() => listsOf(page), [page]);
  const { ref: headerRef, covers: savedCovers } = useCovers<HTMLDivElement>(
    `mood:${MOOD_BROWSE_ID}|${param}`,
    () => getMoodCovers(MOOD_BROWSE_ID, param),
  );

  useEffect(() => {
    let live = true;
    void loadMoods().then((next) => {
      if (live) setMoods(next);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setPage(peekMoodPage(param));
    setMix([]);
    setMixing(false);
    void loadMoodPage(param).then((next) => {
      if (live) setPage(next);
    });
    return () => {
      live = false;
    };
  }, [param]);

  useEffect(() => {
    if (!page || page.shelves.length === 0) return;
    let live = true;
    setMixing(true);
    void loadMix(param, lists.songs, lists.playlists).then((tracks) => {
      if (!live) return;
      setMix(tracks);
      setMixing(false);
    });
    return () => {
      live = false;
    };
  }, [param, page, lists]);

  const meta = mixing
    ? "Mixing its top playlists…"
    : mix.length > 0
      ? `${mix.length} songs`
      : "";
  const cover = lists.playlists[0]?.thumb ?? savedCovers?.[0] ?? null;

  const playMix = (start: number) => playQueue(mix, start);
  const shuffleMix = () => {
    usePlayer.setState({ shuffle: true });
    playQueue(mix, Math.floor(Math.random() * mix.length));
  };

  return (
    <div>
      <div ref={headerRef}>
        <PageHeader
          title={mood?.title ?? page?.title ?? ""}
          artwork={cover}
          meta={meta}
          actions={
            mix.length > 0 && (
              <>
                <button type="button" onClick={() => playMix(0)} className={PILL}>
                  <Icon icon={PlayIcon} />
                  Play mix
                </button>
                <button
                  type="button"
                  onClick={shuffleMix}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-wash px-5 text-[14px] font-semibold text-ink-1 hover:bg-hover motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Icon icon={ShuffleIcon} />
                  Shuffle
                </button>
              </>
            )
          }
        />
      </div>

      {page === undefined ? (
        <div className="mt-10 space-y-9">
          <div className="h-[200px] rounded-[14px] bg-wash bt-skeleton" />
          <div className="h-[200px] rounded-[14px] bg-wash bt-skeleton" />
        </div>
      ) : !page || page.shelves.length === 0 ? (
        <p className="mt-10 text-[14px] text-ink-2">This page couldn't be loaded right now. Try again in a moment.</p>
      ) : (
        <>
          {mix.length > 0 && (
            <Shelf title="Up first in the mix">
              <ol>
                {mix.slice(0, UP_FIRST).map((track, index) => (
                  <li
                    key={track.id}
                    onContextMenu={(event) => openMenuAtPointer(event, () => trackMenuItems(track))}
                    onKeyDown={(event) => void openMenuFromKey(event, () => trackMenuItems(track))}
                  >
                    <button
                      type="button"
                      onClick={() => playMix(index)}
                      className="flex w-full items-center gap-3 rounded-[10px] px-2 py-1.5 text-left hover:bg-wash active:bg-pressed motion-safe:transition-colors"
                    >
                      <span className="flex w-7 shrink-0 justify-center text-[12px] tabular-nums text-ink-2">
                        {track.id === current ? <EqBars playing={playing} /> : String(index + 1).padStart(2, "0")}
                      </span>
                      <Artwork src={track.thumb} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink-1">{track.title}</span>
                        <span className="block truncate text-[13px] text-ink-2">{track.artist}</span>
                      </span>
                      {track.duration > 0 && (
                        <span className="shrink-0 text-[12px] tabular-nums text-ink-2">{fmtTime(track.duration)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </Shelf>
          )}

          {lists.playlists.length > 0 && (
            <Shelf title="Playlists">
              <div className="no-scrollbar flex gap-3 overflow-x-auto">
                {lists.playlists.map((card) => (
                  <BrowseCard
                    key={card.id}
                    item={card}
                    type="playlist"
                    onOpen={() => navigate({ name: "ytplaylist", param: card.id })}
                  />
                ))}
              </div>
            </Shelf>
          )}

          {lists.albums.length > 0 && (
            <Shelf title="Albums" count={lists.albums.length}>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">
                {(wallOpen ? lists.albums : lists.albums.slice(0, WALL_FIRST)).map((card) => (
                  <BrowseCard
                    key={card.id}
                    item={card}
                    type="album"
                    onOpen={() => navigate({ name: "album", param: card.id })}
                  />
                ))}
              </div>
              {lists.albums.length > WALL_FIRST && (
                <button
                  type="button"
                  onClick={() => setWallOpen((open) => !open)}
                  className="mt-4 h-10 rounded-full bg-wash px-4 text-[13px] font-medium text-ink-1 hover:bg-hover"
                >
                  {wallOpen ? "Show fewer" : `Show all ${lists.albums.length}`}
                </button>
              )}
            </Shelf>
          )}

          {lists.artists.length > 0 && (
            <Shelf title="Artists">
              <div className="no-scrollbar flex gap-3 overflow-x-auto">
                {lists.artists.map((card) => (
                  <BrowseCard
                    key={card.id}
                    item={card}
                    round
                    type="artist"
                    onOpen={() => navigate({ name: "artist", param: card.id })}
                  />
                ))}
              </div>
            </Shelf>
          )}
        </>
      )}
    </div>
  );
}
