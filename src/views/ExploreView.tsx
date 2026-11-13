import { useEffect, useMemo, useState } from "react";
import { ChartLineData01Icon, GroupIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "../components/Icon";
import { ArtTile, MoodCard } from "../components/MoodCard";
import { PageHeader } from "../components/PageHeader";
import { freshMoods, loadMoods } from "../lib/explore";
import { bySection, FALLBACK_MOODS, type MoodEntry } from "../lib/moods";
import { PODCASTS_ENABLED } from "../lib/features";
import { freshPodcasts, loadPodcasts } from "../lib/podcasts";
import type { PodcastShelf } from "../lib/podcastParse";
import { usePhone } from "../lib/usePhone";
import { useNavigation } from "../stores/navigation";

const GENRE_PREVIEW = 12;
const MOOD_GRID = "grid grid-cols-2 gap-3 min-[900px]:grid-cols-3 min-[1560px]:grid-cols-4";
const GENRE_GRID = "grid grid-cols-3 gap-3 min-[900px]:grid-cols-4 min-[1560px]:grid-cols-6";

function isGenreSection(title: string): boolean {
  return !/mood/i.test(title);
}

function firstShowThumb(shelves: PodcastShelf[] | null): string | null {
  return (shelves ?? []).flatMap((shelf) => shelf.shows).find((show) => show.thumb)?.thumb ?? null;
}

function PodcastsCard() {
  const navigate = useNavigation((state) => state.navigate);
  const [thumb, setThumb] = useState<string | null>(() => firstShowThumb(freshPodcasts()));

  useEffect(() => {
    let live = true;
    void loadPodcasts().then((shelves) => {
      if (live) setThumb(firstShowThumb(shelves));
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={MOOD_GRID}>
      <ArtTile
        label="Podcasts"
        src={thumb}
        variant="mood"
        onClick={() => navigate({ name: "podcasts" })}
        onBroken={() => setThumb(null)}
      />
    </div>
  );
}

function EntryCard({ label, note, icon, onClick }: {
  label: string;
  note: string;
  icon: IconSvgElement;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 rounded-[11px] bg-wash px-4 py-3 text-left motion-safe:transition-colors hover:bg-hover active:bg-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-panel text-ink-2">
        <Icon icon={icon} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-ink-1">{label}</span>
        <span className="block truncate text-[12px] text-ink-2">{note}</span>
      </span>
    </button>
  );
}

export function ExploreView() {
  const [moods, setMoods] = useState<MoodEntry[]>(() => freshMoods() ?? FALLBACK_MOODS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const navigate = useNavigation((state) => state.navigate);

  useEffect(() => {
    let live = true;
    void loadMoods().then((next) => {
      if (live) setMoods(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const groups = useMemo(() => bySection(moods), [moods]);
  const phone = usePhone();

  const toggle = (title: string) => setExpanded((state) => ({ ...state, [title]: !state[title] }));

  return (
    <div>
      <PageHeader title="Explore" meta="Picked for your region" />
      <div className="mt-4">
        <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
          <EntryCard
            label="Charts"
            note="What everyone is playing"
            icon={ChartLineData01Icon}
            onClick={() => navigate({ name: "charts" })}
          />
          <EntryCard
            label="New releases"
            note="Fresh albums and singles"
            icon={SparklesIcon}
            onClick={() => navigate({ name: "newreleases" })}
          />
          <EntryCard
            label="Listen together"
            note="Play the same song with friends"
            icon={GroupIcon}
            onClick={() => navigate({ name: "listen" })}
          />
        </div>
        {PODCASTS_ENABLED && <PodcastsCard />}
        {groups.map((group) => {
          const genre = isGenreSection(group.title);
          const collapsible = genre && group.moods.length > GENRE_PREVIEW;
          const open = expanded[group.title] === true;
          const shown = collapsible && !open ? group.moods.slice(0, GENRE_PREVIEW) : group.moods;
          return (
            <section key={group.title} className="mt-7">
              <h2
                className={
                  phone
                    ? "mb-3 flex items-baseline gap-2 font-title text-[20px] font-bold leading-[26px] tracking-[-0.02em] text-ink-1"
                    : "mb-3 flex items-baseline gap-2 text-section text-ink-1"
                }
              >
                <span className="min-w-0 truncate">{group.title}</span>
                <span className="text-meta font-normal tabular-nums text-ink-2">{group.moods.length}</span>
              </h2>
              <div className={genre ? GENRE_GRID : MOOD_GRID}>
                {shown.map((mood) => (
                  <MoodCard
                    key={`${mood.title}-${mood.params}`}
                    mood={mood}
                    variant={genre ? "genre" : "mood"}
                  />
                ))}
              </div>
              {collapsible && (
                <button
                  type="button"
                  onClick={() => toggle(group.title)}
                  className="hit-area mt-3 block rounded-control text-meta font-semibold text-ink-2 hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {open ? "Show less" : `Show all ${group.moods.length}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
