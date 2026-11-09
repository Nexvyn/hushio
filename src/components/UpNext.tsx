import { ListMusicIcon } from "@hugeicons/core-free-icons";
import { EmptyState } from "./EmptyState";
import { normalizeCredit } from "../lib/credits";
import { RowThumb } from "./RowThumb";
import { useInk } from "../lib/onArt";
import { usePlayer } from "../stores/player";

export function UpNext() {
  const ink = useInk();
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const jumpTo = usePlayer((state) => state.jumpTo);
  const upcoming = queue.slice(index + 1);

  return (
    <section aria-labelledby="up-next-heading" className="flex min-h-0 flex-col">
      <h2 id="up-next-heading" className={`text-meta font-semibold ${ink.secondary}`}>
        Up Next
      </h2>
      {upcoming.length === 0 ? (
        <EmptyState icon={ListMusicIcon} title="Nothing queued" message="Use Play next or Add to queue on any song." />
      ) : (
        <ul className="mt-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {upcoming.map((track, offset) => (
            <li key={`${index + 1 + offset}:${track.id}`}>
              <button
                type="button"
                onClick={() => jumpTo(index + 1 + offset)}
                aria-label={`Play ${track.title}`}
                className={`flex w-full min-w-0 items-center gap-3 rounded-control px-1.5 py-1.5 text-left ${ink.hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
              >
                <RowThumb src={track.thumb} size={40} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13.5px] ${ink.primary}`}>{track.title}</span>
                  <span className={`block truncate text-[12px] ${ink.secondary}`}>{normalizeCredit(track.artist)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
