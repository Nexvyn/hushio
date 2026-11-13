import { useEffect, useState } from "react";
import { ChartLineData01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { PhoneIcon } from "./PhoneIcon";
import { useCoverFill } from "./useCoverFill";
import { freshMoods, getMoodCovers, loadMoods } from "../../lib/explore";
import { thumbArtwork } from "../../lib/artwork";
import { useCovers } from "../../lib/exploreCovers";
import { MOOD_BROWSE_ID, type MoodEntry } from "../../lib/moods";
import { useNavigation } from "../../stores/navigation";
import { useUI } from "../../stores/ui";

const MAX_MOOD_TILES = 10;
const PLACEHOLDER_TILES = 8;
const COVER_PX = 200;

const TILE =
  "group relative isolate block h-24 w-full overflow-hidden rounded-[12px] bg-elevated text-left [corner-shape:squircle] motion-safe:transition-[transform,background-color] motion-safe:[transition-duration:var(--dur-quick),var(--dur-swap)] motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

const LABEL =
  "absolute bottom-3 left-3 line-clamp-2 font-title text-[16px] leading-[20px] font-bold tracking-[-0.01em]";

type FixedTileProps = { label: string; icon: IconSvgElement; onClick: () => void };

function FixedTile({ label, icon, onClick }: FixedTileProps) {
  return (
    <button type="button" onClick={onClick} className={TILE}>
      <span aria-hidden="true" className="absolute left-3 top-3 text-accent">
        <PhoneIcon icon={icon} />
      </span>
      <span className={`${LABEL} right-3 text-ink-1`}>{label}</span>
    </button>
  );
}

function MoodTile({ mood }: { mood: MoodEntry }) {
  const navigate = useNavigation((state) => state.navigate);
  const setSearchQuery = useUI((state) => state.setSearchQuery);
  const key = mood.params ? `mood:${MOOD_BROWSE_ID}|${mood.params}` : null;
  const { ref, covers, markBroken } = useCovers<HTMLButtonElement>(mood.browseId ? key : null, () =>
    getMoodCovers(mood.browseId, mood.params),
  );
  const art = thumbArtwork(covers?.[0], COVER_PX);
  const fill = useCoverFill(art || "");

  const open = () => {
    if (mood.params) {
      navigate({ name: "mood", param: mood.params });
      return;
    }
    setSearchQuery(mood.title);
    navigate({ name: "search" });
  };

  return (
    <button ref={ref} type="button" onClick={open} className={TILE} style={fill ? { backgroundColor: fill } : undefined}>
      <span className={`${LABEL} ${art ? "right-[80px]" : "right-3"} ${fill ? "text-art" : "text-ink-1"}`}>{mood.title}</span>
      {art && (
        <img
          src={art}
          alt=""
          loading="lazy"
          onError={markBroken}
          className="absolute right-3 top-1/2 size-14 -translate-y-1/2 rounded-[8px] object-cover"
        />
      )}
    </button>
  );
}

export function PhoneBrowseGrid() {
  const navigate = useNavigation((state) => state.navigate);
  const [moods, setMoods] = useState<MoodEntry[] | null>(() => freshMoods());

  useEffect(() => {
    let live = true;
    void loadMoods().then((next) => {
      if (live) setMoods(next);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-title text-[20px] leading-[26px] font-bold tracking-[-0.02em] text-ink-1">Browse all</h2>
        <button
          type="button"
          onClick={() => navigate({ name: "explore" })}
          className="-mr-2 flex h-11 items-center rounded-[10px] px-2 text-[13.5px] text-ink-2 active:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Explore
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FixedTile label="Charts" icon={ChartLineData01Icon} onClick={() => navigate({ name: "charts" })} />
        <FixedTile label="New releases" icon={SparklesIcon} onClick={() => navigate({ name: "newreleases" })} />
        {moods ? (
          moods.slice(0, MAX_MOOD_TILES).map((mood) => <MoodTile key={`${mood.title}-${mood.params}`} mood={mood} />)
        ) : (
          <div aria-hidden="true" className="col-span-2 grid grid-cols-2 gap-3 bt-skeleton">
            {Array.from({ length: PLACEHOLDER_TILES }, (_, index) => (
              <div key={index} className="h-24 rounded-[12px] bg-elevated [corner-shape:squircle]" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
