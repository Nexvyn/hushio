import { Cancel01Icon, MusicNote01Icon, ThumbsDownIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { upgradeArtwork } from "../lib/artwork";
import { useLibrary } from "../stores/library";
import { currentTrack, usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const TABS = [
  { id: "details", label: "Song details" },
  { id: "queue", label: "Queue" },
] as const;

function Cover({ thumb, className }: { thumb: string | null; className: string }) {
  const art = upgradeArtwork(thumb);
  return (
    <div className={`grid place-items-center overflow-hidden text-ink-3 ${className}`}>
      {art ? <img src={art} alt="" className="h-full w-full object-cover" /> : <Icon icon={MusicNote01Icon} />}
    </div>
  );
}

function SongDetails() {
  const track = usePlayer(currentTrack);
  if (!track) {
    return (
      <>
        <p className="px-0.5 text-[12.5px] font-semibold text-ink-2">Nothing playing yet</p>
        <Cover thumb={null} className="mt-3 aspect-square w-full rounded-xl bg-ink-1/[0.04]" />
      </>
    );
  }
  return (
    <>
      <Cover thumb={track.thumb} className="aspect-square w-full rounded-xl bg-wash" />
      <p className="mt-3 truncate text-[18px] font-semibold text-ink-1">{track.title}</p>
      <p className="truncate text-[13px] text-ink-2">{track.artist}</p>
    </>
  );
}

const ICON_BUTTON =
  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 motion-safe:transition-colors hover:text-ink-1";

type TrackRowProps = {
  track: Track;
  onPlay: () => void;
  remove?: { label: string; onRemove: () => void };
  onDontPlay?: () => void;
};

function TrackRow({ track, onPlay, remove, onDontPlay }: TrackRowProps) {
  return (
    <li className="flex items-center gap-1 rounded-lg hover:bg-hover">
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left">
        <Cover thumb={track.thumb} className="h-10 w-10 shrink-0 rounded-[4px] bg-wash" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-ink-1">{track.title}</span>
          <span className="block truncate text-[12px] text-ink-2">{track.artist}</span>
        </span>
      </button>
      {onDontPlay && (
        <button type="button" title="Don't play this" aria-label="Don't play this" onClick={onDontPlay} className={ICON_BUTTON}>
          <Icon icon={ThumbsDownIcon} />
        </button>
      )}
      {remove && (
        <button
          type="button"
          title={remove.label}
          aria-label={remove.label}
          onClick={remove.onRemove}
          className={`mr-1 ${ICON_BUTTON}`}
        >
          <Icon icon={Cancel01Icon} />
        </button>
      )}
    </li>
  );
}

function QueuePanel() {
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const autoplayCount = usePlayer((state) => state.autoplayCount);
  const jumpTo = usePlayer((state) => state.jumpTo);
  const removeAt = usePlayer((state) => state.removeAt);
  const dontPlay = usePlayer((state) => state.dontPlay);
  const clearUpcoming = usePlayer((state) => state.clearUpcoming);
  const playTrack = usePlayer((state) => state.playTrack);
  const history = useLibrary((state) => state.history);
  const removeFromHistory = useLibrary((state) => state.removeFromHistory);
  const clearHistory = useLibrary((state) => state.clearHistory);
  const current = queue[index];
  const upcoming = queue.slice(index + 1);
  const recent = history.filter((track) => track.id !== current?.id);
  const autoplayStart = queue.length - autoplayCount;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="queue-heading">
        <div className="flex items-center justify-between px-0.5">
          <h2 id="queue-heading" className="text-[12.5px] font-semibold text-ink-2">
            Queue
          </h2>
          {upcoming.length > 0 && (
            <button
              type="button"
              onClick={clearUpcoming}
              className="text-[12px] text-ink-2 motion-safe:transition-colors hover:text-ink-1"
            >
              Clear
            </button>
          )}
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-2 px-0.5 text-[13px] text-ink-3">Nothing queued</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-0.5">
            {upcoming.map((track, offset) => {
              const at = index + 1 + offset;
              return (
                <TrackRow
                  key={`${at}:${track.id}`}
                  track={track}
                  onPlay={() => jumpTo(at)}
                  remove={{ label: "Remove from queue", onRemove: () => removeAt(at) }}
                  onDontPlay={at >= autoplayStart ? () => dontPlay(at) : undefined}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <div className="flex items-center justify-between px-0.5">
          <h2 id="recent-heading" className="text-[12.5px] font-semibold text-ink-2">
            Recently played
          </h2>
          {recent.length > 0 && (
            <button
              type="button"
              aria-label="Clear recently played"
              onClick={clearHistory}
              className="text-[12px] text-ink-2 motion-safe:transition-colors hover:text-ink-1"
            >
              Clear
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="mt-2 px-0.5 text-[13px] text-ink-3">
            Nothing here yet — tracks you play land in Recently played.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-0.5">
            {recent.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                onPlay={() => playTrack(track)}
                remove={{ label: "Remove from Recently played", onRemove: () => removeFromHistory(track.id) }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function RightRail() {
  const panel = useUI((state) => state.rightPanel);
  const setRightPanel = useUI((state) => state.setRightPanel);

  return (
    <aside
      aria-label="Now playing panel"
      className="shell-rail flex w-[328px] shrink-0 flex-col overflow-hidden"
    >
      <div role="tablist" aria-label="Now playing tabs" className="flex gap-1 px-3 pt-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`rail-tab-${tab.id}`}
            aria-selected={panel === tab.id}
            aria-controls="rail-panel"
            onClick={() => setRightPanel(tab.id)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium motion-safe:transition-colors ${panel === tab.id ? "bg-wash text-ink-1" : "text-ink-2 hover:text-ink-1"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id="rail-panel"
        role="tabpanel"
        aria-labelledby={`rail-tab-${panel}`}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3"
      >
        {panel === "queue" ? <QueuePanel /> : <SongDetails />}
      </div>
    </aside>
  );
}
