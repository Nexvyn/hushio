import type { SyntheticEvent } from "react";
import { getMoodCovers } from "../lib/explore";
import { useCovers } from "../lib/exploreCovers";
import { MOOD_BROWSE_ID, tone, type MoodEntry } from "../lib/moods";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

type MoodCardProps = { mood: MoodEntry };

function hideOnError(event: SyntheticEvent<HTMLImageElement>, onBroken: () => void) {
  event.currentTarget.style.visibility = "hidden";
  onBroken();
}

function SleeveArt({ covers, onBroken }: { covers: string[] | null; onBroken: () => void }) {
  const [sleeve, disc] = covers ?? [];
  if (!sleeve) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {disc && (
        <img
          src={disc}
          alt=""
          onError={(event) => hideOnError(event, onBroken)}
          className="absolute right-2 top-2 h-[78px] w-[78px] rounded-full object-cover outline outline-1 -outline-offset-1 outline-black/10 [:root[data-theme=dark]_&]:outline-white/10"
        />
      )}
      <img
        src={sleeve}
        alt=""
        onError={(event) => hideOnError(event, onBroken)}
        className="absolute bottom-0 right-4 h-[64px] w-[64px] rounded-[4px] object-cover shadow-md outline outline-1 -outline-offset-1 outline-black/10 [:root[data-theme=dark]_&]:outline-white/10"
      />
    </span>
  );
}

export function MoodCard({ mood }: MoodCardProps) {
  const navigate = useNavigation((state) => state.navigate);
  const setSearchQuery = useUI((state) => state.setSearchQuery);
  const key = mood.params ? `mood:${MOOD_BROWSE_ID}|${mood.params}` : null;
  const { ref, covers, markBroken } = useCovers<HTMLButtonElement>(mood.browseId ? key : null, () =>
    getMoodCovers(mood.browseId, mood.params),
  );

  const open = () => {
    if (mood.params) {
      navigate({ name: "mood", param: mood.params });
      return;
    }
    setSearchQuery(mood.title);
    navigate({ name: "search" });
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={open}
      style={{ backgroundColor: tone(mood.color) }}
      className="relative flex h-[104px] items-end overflow-hidden rounded-[11px] p-3 text-left text-[15px] font-semibold text-white motion-safe:transition-transform motion-safe:active:scale-[0.96]"
    >
      <SleeveArt covers={covers} onBroken={markBroken} />
      <span className="relative min-w-0 truncate">{mood.title}</span>
    </button>
  );
}
