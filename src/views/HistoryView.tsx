import { SkeletonFade } from "../components/SkeletonSwap";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ClockCounterClockwise, Play, X } from "@phosphor-icons/react";
import { ActionMenu } from "../components/ActionMenu";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { HeroIcon } from "../components/HeroIcon";
import { PhoneHeader } from "../components/phone/PhoneHeader";
import { CollectionActions } from "../components/TrackListControls";
import { PHONE_PLAY } from "../components/phone/heroButtons";
import { replayJournal, replayJournalRemove } from "../lib/bridge";
import { thumbArtwork } from "../lib/artwork";
import { groupHistory, historyTracks, isSamePlay, playKey } from "../lib/history";
import { plural } from "../lib/plural";
import type { JournalEntry } from "../lib/replay";
import { usePhone } from "../lib/usePhone";
import { selectionMenuItems } from "../lib/selectionMenu";
import { useTrackSelection } from "../lib/useTrackSelection";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI, type MenuItem } from "../stores/ui";

const HISTORY_SOURCE = "__history__";
const THUMB_PIXELS = 96;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function backToLibrary() {
  const nav = useNavigation.getState();
  if (nav.navPast.length > 0) nav.goBack();
  else nav.navigate({ name: "library" });
}

function playFrom(entries: JournalEntry[], index: number) {
  usePlayer.getState().playQueue(historyTracks(entries), index, HISTORY_SOURCE);
}

function rowId(entry: JournalEntry): string {
  return `${entry.at}:${entry.track.id}`;
}

type HistoryRowProps = {
  entry: JournalEntry;
  onPlay: () => void;
  onRemove: () => void;
  selected: boolean;
  onSelectClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextSelect: () => void;
  multi?: () => MenuItem[];
};

function HistoryRow({ entry, onPlay, onRemove, selected, onSelectClick, onContextSelect, multi }: HistoryRowProps) {
  const phone = usePhone();
  const { title, artist, thumb } = entry.track;
  const time = new Date(entry.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const single = (): MenuItem[] => [
    { label: "Play", icon: Play, onSelect: onPlay },
    { label: "Remove from history", icon: X, danger: true, separatorBefore: true, onSelect: onRemove },
    { label: title, subject: { title, subtitle: artist, thumb: thumb ?? null } },
  ];
  const items = multi ?? single;
  return (
    <li
      className={
        phone
          ? "group flex h-14 select-none items-center gap-3"
          : `group flex h-[66px] select-none items-center gap-3.5 rounded-lg px-3 ${selected ? "bg-selected" : "hover:bg-wash focus-within:bg-wash"}`
      }
      onContextMenu={(event) => {
        event.preventDefault();
        onContextSelect();
        useUI.getState().openContextMenu(event.clientX, event.clientY, items());
      }}
    >
      <button
        type="button"
        onClick={onSelectClick}
        onDoubleClick={onPlay}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onPlay();
        }}
        className={`flex min-w-0 flex-1 items-center ${phone ? "gap-3" : "gap-3.5"} text-left`}
      >
        <span className={`${phone ? "size-12 rounded-[6px]" : "size-11 rounded-md"} shrink-0 overflow-hidden bg-wash`}>
          {thumb && <img src={thumbArtwork(thumb, THUMB_PIXELS)} alt="" loading="lazy" className="size-full object-cover" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-body ${phone ? "font-medium" : "font-semibold"} text-ink-1`}>{title}</span>
          <span className="mt-0.5 block truncate text-meta text-ink-2">{artist}</span>
        </span>
      </button>
      <time dateTime={new Date(entry.at).toISOString()} className="shrink-0 text-meta tabular-nums text-ink-3">
        {time}
      </time>
      <ActionMenu items={items} label={`More options for ${title}`} />
    </li>
  );
}

export function HistoryView() {
  const phone = usePhone();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    replayJournal()
      .then((next) => {
        if (live) setEntries(next);
      })
      .catch((failure: unknown) => {
        if (live) setError(errorText(failure));
      });
    return () => {
      live = false;
    };
  }, []);

  async function remove(entry: JournalEntry) {
    try {
      await replayJournalRemove([playKey(entry)]);
      setEntries((current) => current?.filter((item) => !isSamePlay(item, entry)) ?? current);
      useUI.getState().toast("Removed from history", "success");
    } catch (failure) {
      useUI.getState().toast(`Couldn't remove it: ${errorText(failure)}`, "error");
    }
  }

  const groups = groupHistory(entries ?? [], new Date());
  const ordered = groups.flatMap((group) => group.entries);
  const selection = useTrackSelection("history", ordered.map(rowId));

  async function removeMany(list: JournalEntry[]) {
    if (list.length === 0) return;
    try {
      await replayJournalRemove(list.map(playKey));
      const gone = new Set(list.map(rowId));
      setEntries((current) => current?.filter((item) => !gone.has(rowId(item))) ?? current);
      selection.clear();
      useUI.getState().toast(`Removed ${plural(list.length, "play", "plays")} from history`, "success");
    } catch (failure) {
      useUI.getState().toast(`Couldn't remove them: ${errorText(failure)}`, "error");
    }
  }

  function selectedEntries(): JournalEntry[] {
    return ordered.filter((entry) => selection.isSelected(rowId(entry)));
  }

  function selectedMenu(): MenuItem[] {
    return selectionMenuItems(historyTracks(selectedEntries()), [
      {
        label: "Remove from history",
        icon: X,
        danger: true,
        separatorBefore: true,
        onSelect: () => void removeMany(selectedEntries()),
      },
    ]);
  }
  const none = entries !== null && ordered.length === 0;
  const covers = ordered.flatMap((entry) => (entry.track.thumb ? [thumbArtwork(entry.track.thumb, 140)] : []));

  const facts = error ? undefined : entries === null ? "Loading…" : none ? "Nothing played yet" : plural(ordered.length, "play", "plays");
  const playButton = (className: string) => (
    <button
      type="button"
      aria-label="Play history"
      disabled={none || entries === null}
      onClick={() => playFrom(ordered, 0)}
      className={className}
    >
      <HeroIcon icon={Play} />
      Play
    </button>
  );

  return (
    <div className="pb-14">
      {phone ? (
        <>
          <PhoneHeader title="History" meta={facts} onBack={backToLibrary} />
          <div className="flex">{playButton(`${PHONE_PLAY} !flex-none px-6`)}</div>
        </>
      ) : (
        <CollectionHero
          title="History"
          covers={covers}
          facts={facts}
          icon={ClockCounterClockwise}
          tile={{ icon: ClockCounterClockwise }}
          footer={
            <CollectionActions
              playLabel="Play history"
              disabled={none || entries === null}
              onPlay={() => playFrom(ordered, 0)}
            />
          }
        />
      )}

      <div className={phone && none ? "relative" : "relative mt-6"}>
        <SkeletonFade show={entries === null && !error}>
          <div aria-busy="true" aria-label="Loading your history" className="h-40 rounded-[18px] bg-wash bt-skeleton" />
        </SkeletonFade>
        {error && (
          <EmptyState icon={ClockCounterClockwise} title="History couldn't load" message={error} />
        )}
        {none && (
          <EmptyState
            icon={ClockCounterClockwise}
            title="No listening history yet"
            message="Songs you play show up here. Turn history off under Settings, Your data, to stop recording."
          />
        )}
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h2 className={`${phone ? "px-0" : "px-3"} pb-2 pt-5 text-meta font-semibold text-ink-3`}>{group.label}</h2>
            <ol onKeyDown={(event) => selection.onListKeyDown(event)}>
              {group.entries.map((entry) => (
                <HistoryRow
                  key={`${entry.at}-${entry.track.id}`}
                  entry={entry}
                  onPlay={() => playFrom(ordered, ordered.indexOf(entry))}
                  onRemove={() => void remove(entry)}
                  selected={selection.isSelected(rowId(entry))}
                  onSelectClick={(event) => selection.click(event, rowId(entry))}
                  onContextSelect={() => selection.contextSelect(rowId(entry))}
                  multi={selection.isSelected(rowId(entry)) && selection.count > 1 ? selectedMenu : undefined}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
