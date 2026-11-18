import { SkeletonFade } from "../components/SkeletonSwap";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { focusRing } from "../components/HomeShelves";
import { CoverArt, CoverCardLabel, coverCardClass } from "../components/CoverCard";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { PhoneArt } from "../components/phone/PhoneArt";
import { thumbArtwork } from "../lib/artwork";
import { fetchNewReleases, type ChartAlbum } from "../lib/charts";
import { marketValue } from "../lib/market";
import { usePhone } from "../lib/usePhone";
import { useNavigation } from "../stores/navigation";

type LoadStatus = "loading" | "loaded" | "failed";

const PHONE_GRID = "grid grid-cols-3 gap-x-3 gap-y-5";
const DESKTOP_GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
const GRID_ART = 132;

function ReleaseCard({ album }: { album: ChartAlbum }) {
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const subtitle = `${album.artist}${album.year ? ` · ${album.year}` : ""}`;
  if (phone) {
    return (
      <button
        type="button"
        onClick={() => navigate({ name: "album", param: album.id })}
        className={`min-w-0 rounded-[10px] text-left active:opacity-70 motion-safe:transition-opacity ${focusRing}`}
      >
        <PhoneArt src={thumbArtwork(album.thumb, GRID_ART) || null} radius="rounded-[10px]" />
        <span className="mt-2 block min-w-0">
          <span className="block truncate text-body leading-[18px] font-medium text-ink-1">{album.title}</span>
          <span className="block truncate text-meta leading-[17px] text-ink-2">{subtitle}</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => navigate({ name: "album", param: album.id })}
      className={`${coverCardClass} ${focusRing}`}
    >
      <CoverArt src={album.thumb} />
      <CoverCardLabel title={album.title} subtitle={subtitle} />
    </button>
  );
}

export function NewReleasesView() {
  const [albums, setAlbums] = useState<ChartAlbum[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const phone = usePhone();
  const grid = phone ? PHONE_GRID : DESKTOP_GRID;

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
      <SkeletonFade show={status === "loading" && albums.length === 0}>
        <div role="status" aria-label="Loading New releases" className={`mt-6 ${grid}`}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
            <div key={index} className="aspect-square rounded-[11px] bg-wash" />
          ))}
        </div>
      </SkeletonFade>
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
        <div className={`mt-5 ${grid} bt-stagger`}>
          {albums.map((album) => (
            <ReleaseCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </div>
  );
}
