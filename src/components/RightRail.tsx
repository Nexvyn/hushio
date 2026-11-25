import { t, useT, type TKey } from "../lib/i18n";
import { Fragment, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Queue, MusicNote, ThumbsDown, ArrowsOutSimple, Sparkle } from "@phosphor-icons/react";
import { ActionMenu } from "./ActionMenu";
import { CanvasVideo } from "./CanvasVideo";
import { EmptyState } from "./EmptyState";
import { type MenuSource, openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { useCanvasClip } from "./useCanvasClip";
import { thumbArtwork } from "../lib/artwork";
import { normalizeCredit } from "../lib/credits";
import { historyMenuItems, songOf, trackMenuItems } from "../lib/trackActions";
import { TEST_SONG_ID } from "../lib/devSong";
import { useInk } from "../lib/onArt";
import { saveQueueAsPlaylist } from "../lib/collectionActions";
import { useLibrary } from "../stores/library";
import { currentTrack, usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { instant, pickerIn, pickerOut, reducedMotion } from "../lib/motion";
import { useImageReveal } from "./useImageReveal";
import { QUEUE_TARGET } from "../lib/trackDrop";
import { type SortableRowProps, useSortable } from "../lib/useSortable";
import { useFlip } from "../lib/useFlip";
import type { Track } from "../types";

function Cover({ thumb, className, tone = "text-ink-3" }: { thumb: string | null; className: string; tone?: string }) {
  const art = thumbArtwork(thumb, 56);
  const reveal = useImageReveal(art);
  return (
    <div className={`grid place-items-center overflow-hidden ${tone} ${className}`}>
      {art ? <img loading="lazy" decoding="async" src={art} alt="" onLoad={reveal.onLoad} className={`h-full w-full object-cover ${reveal.className}`} /> : <Icon icon={MusicNote} />}
    </div>
  );
}

const LIKED_SOURCE = "__liked__";

type QueueTab = "queue" | "recent";

type Playlists = { id: string; name: string }[];

function contextName(playingFrom: string | null, playlists: Playlists): string | null {
  if (playingFrom === LIKED_SOURCE) return "Liked Songs";
  const playlist = playingFrom ? playlists.find((item) => item.id === playingFrom) : undefined;
  return playlist?.name ?? null;
}

function sourceLabel(playingFrom: string | null, playlists: Playlists): string {
  return contextName(playingFrom, playlists) ?? t("queue.nowPlaying");
}

type QueueSection = "queued" | "context" | "autoplay";

function sectionHeading(section: QueueSection, playingFrom: string | null, playlists: Playlists): string {
  if (section === "queued") return t("queue.nextInQueue");
  if (section === "autoplay") return t("queue.autoplay");
  const name = contextName(playingFrom, playlists);
  return name ? `Next from: ${name}` : t("queue.upNext");
}

function NowPanel() {
  useT();
  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const animatedCovers = useSettings((state) => state.animatedCovers);
  const dataSaver = useSettings((state) => state.dataSaver);
  const clipUrl = useCanvasClip(track, animatedCovers && !dataSaver);
  if (!track) {
    return (
      <div className="flex flex-col gap-4">
        <Cover thumb={null} className="aspect-square w-full rounded-[8px] bg-ink-1/[0.04]" />
        <p className="text-meta text-ink-2">Play something and it shows up here.</p>
        <UpcomingQueue tab="queue" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Now playing" className="flex flex-col gap-4">
        <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-[8px]">
          <Cover thumb={track.thumb} className="h-full w-full" />
          {clipUrl && <CanvasVideo key={clipUrl} src={clipUrl} playing={playing} className="absolute inset-0 h-full w-full object-cover" />}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-ink-1">{track.title}</p>
            <p className="truncate text-meta text-ink-2">{normalizeCredit(track.artist)}</p>
          </div>
          <LikeButton track={track} className={`hit-area grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink-1 ${PRESS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`} />
        </div>
      </section>
      <UpcomingQueue tab="queue" />
    </div>
  );
}

const PRESS = "bt-press";

const ICON_BUTTON = `hit-area grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 ${PRESS} hover:text-ink-1`;

const REVEAL = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100";

type TrackRowProps = {
  track: Track;
  onPlay: () => void;
  remove?: { label: string; onRemove: () => void };
  onDontPlay?: () => void;
  menu?: MenuSource;
  at?: number;
  rowProps?: SortableRowProps;
};

function TrackRow({ track, onPlay, remove, onDontPlay, menu, at, rowProps }: TrackRowProps) {
  const recommended = track.recommended === true;
  const ink = useInk();
  const rowIconButton = `hit-area grid h-8 w-8 shrink-0 place-items-center rounded-full ${ink.secondary} ${ink.hoverText} ${REVEAL} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`;
  return (
    <li
      {...rowProps}
      data-queue-at={at}
      className={`group relative flex h-14 items-center gap-1 rounded-[6px] px-2 ${ink.hover}`}
      onContextMenu={menu ? (event) => openMenuAtPointer(event, menu) : undefined}
      onKeyDown={(event) => {
        rowProps?.onKeyDown(event);
        if (event.defaultPrevented) return;
        if (menu) void openMenuFromKey(event, menu);
      }}
    >
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Cover thumb={track.thumb} tone={ink.faint} className={`h-10 w-10 shrink-0 rounded-[4px] ${ink.tint}`} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] leading-5 ${ink.primary}`}>{track.title}</span>
          <span className={`flex min-w-0 items-center gap-2 text-meta ${ink.secondary}`}>
            <span className="truncate">{normalizeCredit(track.artist)}</span>
            {recommended && (
              <span className="flex shrink-0 items-center gap-1 text-caption">
                <Icon icon={Sparkle} />
                Recommended
              </span>
            )}
          </span>
        </span>
      </button>
      {onDontPlay && (
        <button type="button" title="Don't play this" aria-label="Don't play this" onClick={onDontPlay} className={`${rowIconButton} ${PRESS}`}>
          <Icon icon={ThumbsDown} />
        </button>
      )}
      {remove && (
        <button type="button" title={remove.label} aria-label={remove.label} onClick={remove.onRemove} className={`${rowIconButton} ${PRESS}`}>
          <Icon icon={X} />
        </button>
      )}
    </li>
  );
}

function confirmClearHistory() {
  useUI.getState().openDialog({
    title: "Clear Recently played?",
    body: "Your listening stats are kept.",
    confirmLabel: "Clear",
    danger: true,
    onConfirm: () => useLibrary.getState().clearHistory(),
  });
}

function UpcomingQueue({ tab }: { tab?: QueueTab }) {
  useT();
  const ink = useInk();
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const jumpTo = usePlayer((state) => state.jumpTo);
  const removeAt = usePlayer((state) => state.removeAt);
  const dontPlay = usePlayer((state) => state.dontPlay);
  const clearUpcoming = usePlayer((state) => state.clearUpcoming);
  const moveUpcoming = usePlayer((state) => state.moveUpcoming);
  const playingFrom = usePlayer((state) => state.playingFrom);
  const playlists = useLibrary((state) => state.playlists);
  const upcoming = queue.slice(index + 1);
  const seen = new Map<string, number>();
  const rows = upcoming.map((track, offset) => {
    const at = index + 1 + offset;
    const section: QueueSection = track.suggested ? "autoplay" : track.queued ? "queued" : "context";
    const occurrence = seen.get(track.id) ?? 0;
    seen.set(track.id, occurrence + 1);
    return { track, at, key: `${track.id}:${occurrence}`, section };
  });
  const listRef = useRef<HTMLUListElement>(null);
  const sortable = useSortable({
    keys: rows.map((row) => row.key),
    listRef,
    onMove: (from, to) => moveUpcoming(index + 1 + from, index + 1 + to),
  });
  useFlip(listRef, rows.map((row) => row.key).join("\n"), sortable.consumeSelfMove);
  const removeKey = (key: string) => {
    const { queue: now, index: playing } = usePlayer.getState();
    const counts = new Map<string, number>();
    const offset = now.slice(playing + 1).findIndex((track) => {
      const occurrence = counts.get(track.id) ?? 0;
      counts.set(track.id, occurrence + 1);
      return `${track.id}:${occurrence}` === key;
    });
    if (offset >= 0) removeAt(playing + 1 + offset);
  };
  const queueActions = (
    <div className="flex shrink-0 items-center gap-3">
      {queue.length > 0 && (
        <button type="button" onClick={() => saveQueueAsPlaylist(queue.slice(index))} className={`text-meta ${ink.secondary} ${PRESS} ${ink.hoverText}`}>
          Save as playlist
        </button>
      )}
      {upcoming.length > 0 && (
        <button type="button" onClick={() => clearUpcoming()} className={`text-meta ${ink.secondary} ${PRESS} ${ink.hoverText}`}>
          Clear queue
        </button>
      )}
    </div>
  );

  return (
    <section
      aria-label={t("player.queue")}
      data-drop-target={QUEUE_TARGET}
      className="rounded-[8px] motion-safe:transition-shadow motion-safe:duration-fade data-[drop-hover=true]:ring-2 data-[drop-hover=true]:ring-accent"
    >
      {queue.length > 0 && (!tab || upcoming.length === 0) && (
        <div className={`flex items-center px-2 ${tab ? "justify-end" : "justify-between"}`}>
          {!tab && <h2 className={`text-meta font-semibold ${ink.secondary}`}>Queue</h2>}
          {queueActions}
        </div>
      )}
      {upcoming.length === 0 ? (
        <EmptyState icon={Queue} title={t("queue.nothing")} message="Use Play next or Add to queue on any song." />
      ) : (
        <ul ref={listRef} {...sortable.listProps} className="mt-2 flex flex-col">
          {rows.map((row, offset) => (
            <Fragment key={row.key}>
              {(offset === 0 || rows[offset - 1].section !== row.section) && (
                <li role="presentation" className="px-2 pb-1 pt-4 first:pt-0">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <h3 className={`min-w-0 truncate text-meta font-semibold ${ink.secondary}`}>{sectionHeading(row.section, playingFrom, playlists)}</h3>
                    {tab && offset === 0 && queueActions}
                  </div>
                </li>
              )}
              <TrackRow
                track={row.track}
                onPlay={() => jumpTo(row.at)}
                remove={{ label: "Remove from queue", onRemove: () => removeKey(row.key) }}
                onDontPlay={row.section === "autoplay" ? () => dontPlay(row.at) : undefined}
                menu={() => trackMenuItems(songOf(row.track))}
                at={row.at}
                rowProps={sortable.bind(row.key)}
              />
            </Fragment>
          ))}
        </ul>
      )}
    </section>
  );
}

export function QueuePanel({ tab }: { tab?: QueueTab }) {
  useT();
  const ink = useInk();
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const toggle = usePlayer((state) => state.toggle);
  const playTrack = usePlayer((state) => state.playTrack);
  const history = useLibrary((state) => state.history);
  const removeFromHistory = useLibrary((state) => state.removeFromHistory);
  const current = queue[index];
  const recent = history.filter((track) => track.id !== current?.id && track.id !== TEST_SONG_ID);

  return (
    <div className="flex flex-col gap-6">
      {(!tab || tab === "queue") && current && (
        <section aria-labelledby="now-playing-heading" className="flex flex-col">
          <h2 id="now-playing-heading" className={`px-2 text-meta font-semibold ${ink.secondary}`}>
            Now playing
          </h2>
          <ul className="mt-2 flex flex-col">
            <TrackRow track={current} onPlay={toggle} menu={() => trackMenuItems(songOf(current))} />
          </ul>
        </section>
      )}

      {(!tab || tab === "queue") && <UpcomingQueue tab={tab} />}

      {(!tab || tab === "recent") && (
        <section aria-labelledby="recent-heading">
          <div className="flex items-center justify-between gap-3 px-2">
            <h2 id="recent-heading" className={`text-meta font-semibold ${ink.secondary}`}>
              Recently played
            </h2>
            {recent.length > 0 && (
              <button
                type="button"
                aria-label={t("queue.clearRecent")}
                onClick={confirmClearHistory}
                className={`text-meta ${ink.secondary} ${PRESS} ${ink.hoverText}`}
              >
                Clear
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className={`mt-2 px-2 text-meta ${ink.faint}`}>Songs you play land here.</p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {recent.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  onPlay={() => playTrack(track)}
                  remove={{ label: "Remove from Recently played", onRemove: () => removeFromHistory(track.id) }}
                  menu={() => historyMenuItems(track)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

const QUEUE_TABS: { id: QueueTab; labelKey: TKey }[] = [
  { id: "queue", labelKey: "player.queue" },
  { id: "recent", labelKey: "queue.recent" },
];

function QueueTabs({ value, onChange }: { value: QueueTab; onChange: (tab: QueueTab) => void }) {
  useT();
  return (
    <div role="tablist" aria-label={t("queue.views")} className="flex min-w-0 items-center gap-5">
      {QUEUE_TABS.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`relative whitespace-nowrap rounded-[4px] pb-2 pt-1 text-[14px] font-semibold ${PRESS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              active ? "text-ink-1" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {t(item.labelKey)}
            {active && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

export function RightRail({ mode = "column" }: { mode?: "column" | "sheet" }) {
  const closeRail = useUI((state) => state.closeRail);
  const panel = useUI((state) => state.rightPanel);
  const playingFrom = usePlayer((state) => state.playingFrom);
  const track = usePlayer(currentTrack);
  const playlists = useLibrary((state) => state.playlists);
  const [queueTab, setQueueTab] = useState<QueueTab>("queue");
  const sheet = mode === "sheet";
  const close = () => closeRail(sheet);
  const reduced = reducedMotion();
  const bodyKey = panel === "queue" ? "queue" : "now";

  return (
    <motion.aside
      aria-label="Now playing panel"
      className={
        sheet
          ? "fixed inset-y-3 right-3 z-30 flex w-[328px] flex-col overflow-hidden rounded-2xl bg-surface shadow-float"
          : "shell-rail relative flex w-[328px] shrink-0 flex-col overflow-hidden"
      }
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? undefined : { opacity: 0, x: 24, transition: pickerOut }}
      transition={reduced ? instant : pickerIn}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4">
        {panel === "queue" ? (
          <QueueTabs value={queueTab} onChange={setQueueTab} />
        ) : (
          <p className="min-w-0 truncate text-body font-semibold text-ink-1">{sourceLabel(playingFrom, playlists)}</p>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {panel !== "queue" && (
            <>
              <button type="button" aria-label={t("queue.expand")} title={t("queue.expand")} onClick={() => useUI.getState().openNowPlaying()} className={ICON_BUTTON}>
                <Icon icon={ArrowsOutSimple} />
              </button>
              <ActionMenu
                items={() => (track ? trackMenuItems(songOf(track)) : [])}
                label="Track options"
                triggerClass={ICON_BUTTON}
                disabled={!track}
              />
            </>
          )}
          <button type="button" aria-label={t("queue.closePanel")} title={t("queue.closePanel")} onClick={close} className={ICON_BUTTON}>
            <Icon icon={X} />
          </button>
        </div>
      </header>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={bodyKey}
            initial={reduced ? false : { opacity: 0, x: panel === "queue" ? 12 : -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? undefined : { opacity: 0, x: panel === "queue" ? -12 : 12, transition: pickerOut }}
            transition={reduced ? instant : pickerIn}
          >
            {panel === "queue" && queueTab === "recent" ? <QueuePanel tab="recent" /> : <NowPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
