import type { IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  Cancel01Icon,
  Clock01Icon,
  Download01Icon,
  FolderOpenIcon,
  PlayIcon,
  RefreshIcon,
  ShuffleIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { PILL, ROUND } from "../components/BrowseHero";
import { upgradeArtwork } from "../lib/artwork";
import {
  cancelDownload,
  downloadMenuItems,
  openDownloadFolder,
  revealDownload,
  startDownload,
} from "../lib/downloads";
import { fmtTime, fmtTotal } from "../lib/format";
import { plural } from "../lib/plural";
import { type DownloadItem, useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const DOWNLOADS_SOURCE = "__downloads__";

function byTitle(a: DownloadItem, b: DownloadItem): number {
  return a.track.title.localeCompare(b.track.title);
}

function asTrack(item: DownloadItem): Track {
  return {
    id: item.track.id,
    title: item.track.title,
    artist: item.track.artist,
    thumb: item.track.thumb ?? null,
  };
}

function percent(item: DownloadItem): number {
  return Math.round(item.progress * 100);
}

function playSaved(saved: DownloadItem[], index: number, shuffle: boolean) {
  const tracks = saved.map(asTrack);
  if (shuffle) usePlayer.setState({ shuffle: true });
  const start = shuffle ? Math.floor(Math.random() * tracks.length) : index;
  usePlayer.getState().playQueue(tracks, start, DOWNLOADS_SOURCE);
}

function statusLine(item: DownloadItem): { text: string; className: string } {
  switch (item.status) {
    case "downloading":
      return { text: `Downloading · ${percent(item)}%`, className: "text-accent" };
    case "queued":
      return { text: "Waiting to download", className: "text-ink-3" };
    case "failed":
      return { text: "Couldn't download", className: "text-danger-text" };
    case "done":
      return { text: "Saved", className: "text-ink-3" };
  }
}

function badgeIcon(item: DownloadItem): IconSvgElement | null {
  switch (item.status) {
    case "done":
      return Tick02Icon;
    case "failed":
      return Alert02Icon;
    case "queued":
      return Clock01Icon;
    case "downloading":
      return null;
  }
}

function IconButton({
  label,
  icon,
  danger = false,
  onClick,
}: {
  label: string;
  icon: IconSvgElement;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex size-10 items-center justify-center rounded-full hover:bg-hover ${
        danger ? "text-danger-text" : "text-ink-2 hover:text-ink-1"
      }`}
    >
      <Icon icon={icon} />
    </button>
  );
}

function DownloadRow({ item, onPlay }: { item: DownloadItem; onPlay: (() => void) | null }) {
  const busy = item.status === "queued" || item.status === "downloading";
  const line = statusLine(item);
  const badge = badgeIcon(item);
  const shown = item.status === "done" ? item.path : null;
  const fill = item.status === "done" ? 100 : percent(item);
  const reveal = busy
    ? ""
    : "motion-safe:transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100";

  return (
    <li
      className="group flex h-[66px] select-none items-center gap-3.5 rounded-lg px-3 hover:bg-wash focus-within:bg-wash"
      onContextMenu={(event) => {
        event.preventDefault();
        useUI.getState().openContextMenu(event.clientX, event.clientY, downloadMenuItems(item));
      }}
    >
      <button
        type="button"
        disabled={onPlay === null}
        onClick={onPlay ?? undefined}
        className="flex min-w-0 flex-1 items-center gap-3.5 rounded-lg text-left disabled:cursor-default"
      >
        <span className="relative size-[52px] shrink-0 overflow-hidden rounded-lg bg-wash">
          {item.track.thumb && item.status !== "queued" && item.status !== "failed" && (
            <img
              src={upgradeArtwork(item.track.thumb)}
              alt=""
              className="absolute inset-0 size-full object-cover"
              style={{ clipPath: `inset(${100 - fill}% 0 0 0)` }}
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-scrim/40 text-on-scrim">
            {item.status === "downloading" ? (
              <span className="text-[12px] font-semibold tabular-nums">{percent(item)}%</span>
            ) : (
              badge && <Icon icon={badge} />
            )}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span title={item.track.title} className="block truncate text-[16px] font-semibold tracking-[-0.2px] text-ink-1">
            {item.track.title}
          </span>
          <span className="mt-0.5 block truncate text-[14px] text-ink-2">{item.track.artist}</span>
        </span>
      </button>
      <span className={`w-44 shrink-0 truncate text-[13px] ${line.className}`}>{line.text}</span>
      <span className={`flex w-[120px] shrink-0 justify-end gap-1 ${reveal}`}>
        {(item.status === "queued" || item.status === "downloading") && (
          <IconButton
            label="Cancel download"
            icon={Cancel01Icon}
            danger
            onClick={() => void cancelDownload(item.track.id)}
          />
        )}
        {item.status === "failed" && (
          <IconButton label="Retry download" icon={RefreshIcon} onClick={() => void startDownload(item.track)} />
        )}
        {shown && <IconButton label="Show in folder" icon={FolderOpenIcon} onClick={() => revealDownload(shown)} />}
        {!busy && (
          <IconButton
            label="Remove from list"
            icon={Cancel01Icon}
            danger
            onClick={() => useLibrary.getState().removeDownload(item.track.id)}
          />
        )}
      </span>
      <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-ink-3">
        {item.track.duration > 0 ? fmtTime(item.track.duration) : "—"}
      </span>
    </li>
  );
}

export function DownloadsView() {
  const downloads = useLibrary((state) => state.downloads);
  const items = Object.values(downloads).sort(byTitle);
  const saved = items.filter((item) => item.status === "done");
  const active = items.filter((item) => item.status === "queued" || item.status === "downloading").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const total = saved.reduce((sum, item) => sum + item.track.duration, 0);
  const covers = items.flatMap((item) => (item.track.thumb ? [upgradeArtwork(item.track.thumb)] : []));
  const none = saved.length === 0;

  const facts = (
    <>
      {none ? "Nothing saved yet" : `${plural(saved.length, "song", "songs")} · ${fmtTotal(total)}`}
      {active > 0 && <span className="text-ink-1"> · {active} on the way</span>}
      {failed > 0 && <span className="text-danger-text"> · {failed} couldn't download</span>}
    </>
  );

  return (
    <div className="pb-14">
      <CollectionHero icon={Download01Icon} kind="Saved for offline" title="Downloads" covers={covers} facts={facts}>
        <button
          type="button"
          aria-label="Play Downloads"
          disabled={none}
          onClick={() => playSaved(saved, 0, false)}
          className={PILL}
        >
          <Icon icon={PlayIcon} />
          Play
        </button>
        <button
          type="button"
          aria-label="Shuffle"
          title="Shuffle"
          disabled={none}
          onClick={() => playSaved(saved, 0, true)}
          className={ROUND}
        >
          <Icon icon={ShuffleIcon} />
        </button>
        <button
          type="button"
          aria-label="Open the downloads folder"
          title="Open folder"
          onClick={openDownloadFolder}
          className={ROUND}
        >
          <Icon icon={FolderOpenIcon} />
        </button>
      </CollectionHero>

      <div className="relative mt-6">
        {items.length === 0 ? (
          <EmptyState
            icon={Download01Icon}
            title="No downloads yet"
            message={`Right-click any song and choose "Download", or use the download arrow on a song row. Its cover joins the wall above once it starts.`}
          />
        ) : (
          <ol>
            {items.map((item) => {
              const index = saved.indexOf(item);
              return (
                <DownloadRow
                  key={item.track.id}
                  item={item}
                  onPlay={item.status === "done" ? () => playSaved(saved, index, false) : null}
                />
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
