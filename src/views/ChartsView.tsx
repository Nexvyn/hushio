import { useEffect, useMemo, useState } from "react";
import { motion, useTransform } from "motion/react";
import { PageHeader } from "../components/PageHeader";
import { Cover, focusRing } from "../components/HomeShelves";
import { CoverArt, CoverCardLabel, coverCardClass } from "../components/CoverCard";
import { SectionHeader } from "../components/SectionHeader";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { thumbArtwork } from "../lib/artwork";
import { chartTracks, fetchCharts, type ChartShelf } from "../lib/charts";
import { marketValue } from "../lib/market";
import type { Market } from "../lib/innertube";
import { PhoneArt } from "../components/phone/PhoneArt";
import { PhoneProfileButton } from "../components/phone/PhoneProfileButton";
import { PhoneSectionHeader, PhoneShelfCard } from "../components/phone/PhoneShelf";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { PullIndicator } from "../components/phone/PullIndicator";
import { usePullToRefresh } from "../components/phone/usePullToRefresh";
import { SkeletonSwap } from "../components/SkeletonSwap";
import { trackMenuItems } from "../lib/trackActions";
import { browseMenuItems } from "../lib/browseActions";
import { usePhone } from "../lib/usePhone";
import { playFromRow, usePlayer } from "../stores/player";
import { useNavigation } from "../stores/navigation";

const SHELF_ART = 148;

type LoadStatus = "loading" | "loaded" | "failed";

const REFRESH_MS = 10 * 60 * 1000;

type ChartsCache = { key: string; shelves: ChartShelf[]; loadedAt: number };

let chartsCache: ChartsCache | null = null;

function marketKey(market: Market): string {
  return `${market.location}|${market.lang}`;
}

export function clearChartsCache() {
  chartsCache = null;
}

function matchesQuery(query: string, ...fields: string[]): boolean {
  return fields.some((field) => field.toLowerCase().includes(query));
}

function filterShelves(shelves: ChartShelf[], filter: string): ChartShelf[] {
  const query = filter.trim().toLowerCase();
  if (!query) return shelves;
  return shelves
    .map((shelf) => ({
      ...shelf,
      songs: shelf.songs.filter((song) => matchesQuery(query, song.title, song.artist)),
      albums: shelf.albums.filter((album) => matchesQuery(query, album.title, album.artist)),
    }))
    .filter((shelf) => shelf.songs.length > 0 || shelf.albums.length > 0);
}

function AlbumCard({ album }: { album: ChartShelf["albums"][number] }) {
  const navigate = useNavigation((state) => state.navigate);
  return (
    <button
      type="button"
      onClick={() => navigate({ name: "album", param: album.id })}
      className={`w-[160px] ${coverCardClass} ${focusRing}`}
    >
      <CoverArt src={album.thumb} />
      <CoverCardLabel title={album.title} subtitle={album.artist} />
    </button>
  );
}

function SongRow({ title, artist, thumb, position, onPlay }: {
  title: string;
  artist: string;
  thumb: string | null;
  position: number;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`flex w-full min-w-0 items-center gap-3 rounded-[10px] p-2 text-left motion-safe:transition-colors hover:bg-wash active:bg-pressed ${focusRing}`}
    >
      <span className="w-6 shrink-0 text-meta tabular-nums text-ink-2">{position}</span>
      <span className="h-11 w-11 shrink-0">
        <Cover src={thumb} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-meta font-medium text-ink-1">{title}</span>
        <span className="block truncate text-meta text-ink-2">{artist}</span>
      </span>
    </button>
  );
}

function PhoneChartShelf({ shelf }: { shelf: ChartShelf }) {
  const navigate = useNavigation((state) => state.navigate);
  const tracks = chartTracks(shelf);
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);
  return (
    <section className="mt-7">
      <PhoneSectionHeader title={shelf.title} />
      {shelf.songs.length > 0 && (
        <ol>
          {shelf.songs.map((song, index) => (
            <PhoneSongRow
              key={song.id}
              index={index}
              song={song}
              current={song.id === currentId}
              playing={playing}
              numbered
              menu={() => trackMenuItems(song)}
              onPlay={() => playFromRow(tracks, index)}
            />
          ))}
        </ol>
      )}
      {shelf.albums.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
          {shelf.albums.map((album) => (
            <PhoneShelfCard
              key={album.id}
              art={<PhoneArt src={thumbArtwork(album.thumb, SHELF_ART) || null} radius="rounded-[10px]" />}
              title={album.title}
              subtitle={album.artist}
              menu={() => browseMenuItems({ type: "album", browseId: album.id, title: album.title, subtitle: album.artist, thumb: album.thumb })}
              onActivate={() => navigate({ name: "album", param: album.id })}
            />
          ))}
      </div>
      )}
    </section>
  );
}

function Shelf({ shelf }: { shelf: ChartShelf }) {
  const phone = usePhone();
  if (shelf.songs.length === 0 && shelf.albums.length === 0) return null;
  if (phone) return <PhoneChartShelf shelf={shelf} />;
  const tracks = chartTracks(shelf);
  return (
    <section className="mt-7">
      <SectionHeader title={shelf.title} />
      {shelf.songs.length > 0 && (
        <ol className="mt-2 space-y-0.5">
          {shelf.songs.map((song, index) => (
            <li key={song.id}>
              <SongRow
                title={song.title}
                artist={song.artist}
                thumb={song.thumb}
                position={index + 1}
                onPlay={() => playFromRow(tracks, index)}
              />
            </li>
          ))}
        </ol>
      )}
      {shelf.albums.length > 0 && (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-4 gap-y-6 pb-3">
          {shelf.albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ChartsView() {
  const phone = usePhone();
  const market = marketValue();
  const key = marketKey(market);
  const cached = chartsCache?.key === key ? chartsCache : null;
  const [shelves, setShelves] = useState<ChartShelf[]>(cached?.shelves ?? []);
  const [status, setStatus] = useState<LoadStatus>(cached ? "loaded" : "loading");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => filterShelves(shelves, filter), [shelves, filter]);
  const refresh = () => {
    chartsCache = null;
    setAttempt((count) => count + 1);
  };
  const pull = usePullToRefresh({ enabled: phone, busy: status === "loading", onRefresh: refresh });
  const pullWillChange = useTransform(pull.distance, (distance) => (distance > 0 ? "transform" : "auto"));

  useEffect(() => {
    let live = true;
    const current = chartsCache?.key === key ? chartsCache : null;
    if (current && Date.now() - current.loadedAt < REFRESH_MS) return;
    if (!current) setStatus("loading");
    fetchCharts(market).then(
      (page) => {
        chartsCache = { key, shelves: page.shelves, loadedAt: Date.now() };
        if (!live) return;
        setShelves(page.shelves);
        setStatus("loaded");
      },
      () => {
        if (live && !current) setStatus("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [attempt, key, market]);

  return (
    <div className="relative">
      {phone && <PullIndicator distance={pull.distance} spinning={pull.refreshing} />}
      <motion.div style={phone ? { y: pull.distance, willChange: pullWillChange } : undefined}>
      <PageHeader title={phone ? "Hotlist" : "Charts"} meta={phone ? undefined : "What's playing everywhere"} actions={phone ? <PhoneProfileButton /> : undefined} />
      <div className="mt-5">
        <input
          type="search"
          aria-label="Filter charts"
          placeholder="Filter charts"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="h-11 w-full rounded-[12px] bg-wash px-4 text-body text-ink-1 placeholder:text-ink-3 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>
      <SkeletonSwap
        loading={status === "loading" && shelves.length === 0}
        skeleton={
          <div role="status" aria-label="Loading Charts" className="mt-6 space-y-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-[64px] rounded-[11px] bg-wash bt-skeleton" />
            ))}
          </div>
        }
      >
        {visible.map((shelf, index) => (
          <Shelf key={`${shelf.title}-${index}`} shelf={shelf} />
        ))}
        {filter.trim() && shelves.length > 0 && visible.length === 0 && (
          <div className="mt-6">
            <EmptyState title={`No charts match “${filter.trim()}”`} message="Try another song or artist." />
          </div>
        )}
      </SkeletonSwap>
      {status === "failed" && shelves.length === 0 && (
        <div className="mt-6">
          <ErrorState
            title="Couldn't load the charts"
            message="Check your connection, then try again."
            action={{ label: "Try again", onClick: () => setAttempt((count) => count + 1) }}
          />
        </div>
      )}
      {status === "loaded" && shelves.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No charts right now" message="Try again in a little while." />
        </div>
      )}
      </motion.div>
    </div>
  );
}
