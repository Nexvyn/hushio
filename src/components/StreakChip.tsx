import { useEffect, useState } from "react";
import { FireIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { replaySummary } from "../lib/bridge";
import { streakNow, type DayMs } from "../lib/replay";
import { useListeningNow } from "../lib/replayData";
import { useNavigation } from "../stores/navigation";

export function StreakChip() {
  const listeningNow = useListeningNow();
  const navigate = useNavigation((state) => state.navigate);
  const [days, setDays] = useState<DayMs[] | null>(null);

  useEffect(() => {
    let live = true;
    replaySummary("all").then(
      (data) => {
        if (live) setDays(data.days);
      },
      () => {
        if (live) setDays(null);
      },
    );
    return () => {
      live = false;
    };
  }, [listeningNow]);

  if (days === null) return null;
  const { current } = streakNow(days, new Date(), listeningNow);
  const label = `${current} ${current === 1 ? "day" : "days"}`;

  return (
    <button
      type="button"
      title="Open Replay"
      aria-label={`Listening streak: ${label}`}
      onClick={() => navigate({ name: "replay" })}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-wash px-3 text-[12.5px] font-medium tabular-nums text-ink-1 motion-safe:transition-colors motion-safe:duration-quick hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
    >
      <span className={current > 0 ? "text-accent" : "text-ink-3"}>
        <Icon icon={FireIcon} />
      </span>
      {label}
    </button>
  );
}
