import { useEffect, useMemo, useState } from "react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../components/Icon";
import { MoodCard } from "../components/MoodCard";
import { freshMoods, loadMoods } from "../lib/explore";
import { bySection, FALLBACK_MOODS, PODCASTS_COLOR, type MoodEntry } from "../lib/moods";
import { useNavigation } from "../stores/navigation";

function PodcastsCard() {
  const navigate = useNavigation((state) => state.navigate);
  return (
    <button
      type="button"
      onClick={() => navigate({ name: "podcasts" })}
      style={{ backgroundColor: PODCASTS_COLOR }}
      className="flex h-[132px] w-full flex-col justify-end overflow-hidden rounded-[14px] p-5 text-left text-white motion-safe:transition-transform motion-safe:active:scale-[0.96]"
    >
      <span className="font-display text-[26px] font-bold tracking-[-0.02em]">Podcasts</span>
      <span className="mt-1 text-[13px] opacity-85">Popular shows and episodes in your region</span>
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
