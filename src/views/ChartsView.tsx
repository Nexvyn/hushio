import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Cover, focusRing } from "../components/HomeShelves";
import { SectionHeader } from "../components/SectionHeader";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { chartTracks, fetchCharts, type ChartShelf } from "../lib/charts";
import { marketValue } from "../lib/market";
import { playFromRow } from "../stores/player";
import { useNavigation } from "../stores/navigation";

type LoadStatus = "loading" | "loaded" | "failed";

function AlbumCard({ album }: { album: ChartShelf["albums"][number] }) {
  const navigate = useNavigation((state) => state.navigate);
  return (
    <button
      type="button"
      onClick={() => navigate({ name: "album", param: album.id })}
      className={`w-[160px] shrink-0 rounded-[11px] p-1 text-left motion-safe:transition-colors hover:bg-wash active:bg-pressed ${focusRing}`}
    >
      <Cover src={album.thumb} />
      <span className="mt-2 block min-w-0 px-0.5">
        <span className="block truncate text-[13px] font-medium text-ink-1">{album.title}</span>
        <span className="block truncate text-[12px] text-ink-2">{album.artist}</span>
      </span>
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
      <span className="w-6 shrink-0 text-[13px] tabular-nums text-ink-2">{position}</span>
      <span className="h-11 w-11 shrink-0">
        <Cover src={thumb} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-ink-1">{title}</span>
        <span className="block truncate text-[12px] text-ink-2">{artist}</span>
      </span>
    </button>
  );
}

function Shelf({ shelf }: { shelf: ChartShelf }) {
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
        <div className="no-scrollbar mt-3 flex items-start gap-3 overflow-x-auto pb-3">
          {shelf.albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ChartsView() {
  const [shelves, setShelves] = useState<ChartShelf[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setStatus("loading");
    fetchCharts(marketValue()).then(
      (page) => {
        if (!live) return;
        setShelves(page.shelves);
        setStatus("loaded");
      },
      () => {
        if (live) setStatus("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <div>
      <PageHeader title="Charts" meta="What's playing everywhere" />
      {status === "loading" && shelves.length === 0 && (
        <div role="status" aria-label="Loading Charts" className="mt-6 space-y-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-[64px] rounded-[11px] bg-wash" />
          ))}
        </div>
      )}
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
      {shelves.map((shelf, index) => (
        <Shelf key={`${shelf.title}-${index}`} shelf={shelf} />
      ))}
    </div>
  );
}
