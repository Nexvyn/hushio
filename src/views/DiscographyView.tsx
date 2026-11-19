import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { focusRing } from "../components/HomeShelves";
import { CoverArt, CoverCardLabel, coverCardClass } from "../components/CoverCard";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { PhoneArt } from "../components/phone/PhoneArt";
import { SkeletonSwap } from "../components/SkeletonSwap";
import { thumbArtwork } from "../lib/artwork";
import {
  availableFilters,
  filterReleases,
  getDiscography,
  type Release,
  type ReleaseFilter,
} from "../lib/discography";
import { plural } from "../lib/plural";
import { useBrowseLoad } from "../lib/useBrowseLoad";
import { usePhone } from "../lib/usePhone";
import { useNavigation } from "../stores/navigation";

const FILTER_LABELS: Record<ReleaseFilter, string> = {
  all: "All",
  albums: "Albums",
  singles: "Singles & EPs",
  compilations: "Compilations",
};

const PHONE_GRID = "grid grid-cols-3 gap-x-3 gap-y-5";
const DESKTOP_GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
const GRID_ART = 132;

function ReleaseCard({ release }: { release: Release }) {
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const subtitle = [release.year, release.type].filter(Boolean).join(" · ");
  const open = () => navigate({ name: "album", param: release.id });
  if (phone) {
    return (
      <button type="button" onClick={open} className={`min-w-0 rounded-[10px] text-left active:opacity-70 motion-safe:transition-opacity ${focusRing}`}>
        <PhoneArt src={thumbArtwork(release.thumb, GRID_ART) || null} radius="rounded-[10px]" />
        <span className="mt-2 block min-w-0">
          <span className="block truncate text-body leading-[18px] font-medium text-ink-1">{release.title}</span>
          <span className="block truncate text-meta leading-[17px] text-ink-2">{subtitle}</span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={open} className={`${coverCardClass} ${focusRing}`}>
      <CoverArt src={release.thumb} />
      <CoverCardLabel title={release.title} subtitle={subtitle} />
    </button>
  );
}

function FilterChips({ filters, value, onChange }: { filters: ReleaseFilter[]; value: ReleaseFilter; onChange: (filter: ReleaseFilter) => void }) {
  return (
    <div role="group" aria-label="Filter releases" className="flex flex-wrap gap-2">
      {filters.map((filter) => {
        const active = filter === value;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(filter)}
            className={`h-8 rounded-full px-3 text-meta font-medium motion-safe:transition-colors ${
              active ? "bg-accent text-on-accent" : "bg-wash text-ink-1 hover:bg-hover"
            } ${focusRing}`}
          >
            {FILTER_LABELS[filter]}
          </button>
        );
      })}
    </div>
  );
}

export function DiscographyView() {
  const artistId = useNavigation((state) => state.view.param) ?? "";
  const { state, retry } = useBrowseLoad(artistId, getDiscography);
  const [filter, setFilter] = useState<ReleaseFilter>("all");
  const phone = usePhone();
  const grid = phone ? PHONE_GRID : DESKTOP_GRID;

  if (state.status === "error") {
    return (
      <div>
        <PageHeader title="Discography" eyebrow="Artist" />
        <div className="mt-6">
          <ErrorState
            title="Couldn't load the discography"
            message="Check your connection, then try again."
            action={{ label: "Try again", onClick: retry }}
          />
        </div>
      </div>
    );
  }

  const loaded = state.status === "ready" ? state.data : null;
  const releases = loaded?.releases ?? [];
  const filters = availableFilters(releases);
  const active = filters.includes(filter) ? filter : "all";
  const visible = filterReleases(releases, active);

  return (
    <div className="pb-12">
      <PageHeader
        title={loaded?.artistName || "Discography"}
        eyebrow={loaded ? "Discography" : "Artist"}
        meta={loaded ? plural(releases.length, "release", "releases") : undefined}
      />
      <SkeletonSwap
        loading={!loaded}
        skeleton={
          <div role="status" aria-label="Loading discography" className={`mt-5 ${grid}`}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
              <div key={index} className="aspect-square rounded-[11px] bg-wash" />
            ))}
          </div>
        }
      >
        {loaded &&
          (releases.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="No releases yet" message="This artist has not published any albums or singles." />
            </div>
          ) : (
            <>
              {filters.length > 2 && (
                <div className="mt-5">
                  <FilterChips filters={filters} value={active} onChange={setFilter} />
                </div>
              )}
              <div className={`mt-5 ${grid} bt-stagger`}>
                {visible.map((release) => (
                  <ReleaseCard key={release.id} release={release} />
                ))}
              </div>
            </>
          ))}
      </SkeletonSwap>
    </div>
  );
}
