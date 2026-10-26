import { useEffect, useMemo, useState } from "react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../components/Icon";
import { MoodCard } from "../components/MoodCard";
import { freshMoods, loadMoods } from "../lib/explore";
import { bySection, FALLBACK_MOODS, PODCASTS_COLOR, type MoodEntry } from "../lib/moods";
import { freshPodcasts, loadPodcasts } from "../lib/podcasts";
import type { PodcastShelf } from "../lib/podcastParse";
import { useNavigation } from "../stores/navigation";

const BANNER_SHOWS = 3;
const FAN = ["left-0 -rotate-[10deg]", "left-6", "left-12 rotate-[10deg]"];

function showThumbs(shelves: PodcastShelf[] | null): string[] {
  return (shelves ?? [])
    .flatMap((shelf) => shelf.shows)
    .flatMap((show) => (show.thumb ? [show.thumb] : []))
    .slice(0, BANNER_SHOWS);
}

function PodcastsCard() {
  const navigate = useNavigation((state) => state.navigate);
  const [thumbs, setThumbs] = useState<string[]>(() => showThumbs(freshPodcasts()));

  useEffect(() => {
    let live = true;
    void loadPodcasts().then((shelves) => {
      if (live) setThumbs(showThumbs(shelves));
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => navigate({ name: "podcasts" })}
      style={{ backgroundColor: PODCASTS_COLOR }}
      className="relative flex h-[132px] w-full flex-col justify-end overflow-hidden rounded-[14px] p-5 text-left text-white motion-safe:transition-transform motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
    >
      <span className="relative block max-w-[60%]">
        <span className="font-display block text-[26px] font-bold tracking-[-0.02em]">Podcasts</span>
        <span className="mt-1 block text-[13px] opacity-85">Popular shows and episodes in your region</span>
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute right-6 top-1/2 h-[80px] w-[80px] -translate-y-1/2">
        {thumbs.map((src, index) => (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            className={`absolute top-0 h-[72px] w-[72px] rounded-[10px] object-cover outline outline-1 -outline-offset-1 outline-black/10 ${FAN[index]}`}
          />
        ))}
      </span>
    </button>
  );
}

export function ExploreView() {
  const [moods, setMoods] = useState<MoodEntry[]>(() => freshMoods() ?? FALLBACK_MOODS);

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

  return (
    <div className="pt-2">
      <h1 className="flex items-center gap-2 text-[34px] font-extrabold tracking-[-0.03em] text-ink-1">
        <Icon icon={SparklesIcon} />
        Explore
      </h1>
      <p className="mb-6 mt-1 text-[13px] text-ink-2">Picked for your region by YouTube Music</p>
      <PodcastsCard />
      {groups.map((group) => (
        <section key={group.title} className="mt-9">
          <h2 className="mb-4 flex items-baseline gap-2 text-[21px] font-semibold text-ink-1">
            {group.title}
            <span className="text-[14px] font-medium tabular-nums text-ink-3">{group.moods.length}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {group.moods.map((mood) => (
              <MoodCard key={`${mood.title}-${mood.params}`} mood={mood} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
