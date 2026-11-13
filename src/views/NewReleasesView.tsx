import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Cover, focusRing } from "../components/HomeShelves";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { fetchNewReleases, type ChartAlbum } from "../lib/charts";
import { marketValue } from "../lib/market";
import { useNavigation } from "../stores/navigation";

type LoadStatus = "loading" | "loaded" | "failed";

function ReleaseCard({ album }: { album: ChartAlbum }) {
  const navigate = useNavigation((state) => state.navigate);
  return (
    <button
      type="button"
      onClick={() => navigate({ name: "album", param: album.id })}
      className={`rounded-[11px] p-1 text-left motion-safe:transition-colors hover:bg-wash active:bg-pressed ${focusRing}`}
    >
      <Cover src={album.thumb} />
      <span className="mt-2 block min-w-0 px-0.5">
        <span className="block truncate text-[13px] font-medium text-ink-1">{album.title}</span>
        <span className="block truncate text-[12px] text-ink-2">
          {album.artist}
          {album.year ? ` · ${album.year}` : ""}
        </span>
      </span>
    </button>
  );
}

export function NewReleasesView() {
  const [albums, setAlbums] = useState<ChartAlbum[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setStatus("loading");
    fetchNewReleases(marketValue()).then(
      (shelf) => {
        if (!live) return;
        setAlbums(shelf.albums);
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
      <PageHeader title="New releases" meta="Fresh albums and singles" />
      {status === "loading" && albums.length === 0 && (
        <div role="status" aria-label="Loading New releases" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
            <div key={index} className="aspect-square rounded-[11px] bg-wash" />
          ))}
        </div>
      )}
      {status === "failed" && albums.length === 0 && (
        <div className="mt-6">
          <ErrorState
            title="Couldn't load the new releases"
            message="Check your connection, then try again."
            action={{ label: "Try again", onClick: () => setAttempt((count) => count + 1) }}
          />
        </div>
      )}
      {status === "loaded" && albums.length === 0 && (
        <div className="mt-6">
          <EmptyState title="Nothing new yet" message="Check back in a little while." />
        </div>
      )}
      {albums.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {albums.map((album) => (
            <ReleaseCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </div>
  );
}
