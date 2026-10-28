import { Cancel01Icon, FolderOpenIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import {
  downloadCancel,
  downloadQueue,
  downloadStart,
  listenDownloadEvents,
  openFolder,
  pickFolder,
  revealPath,
  type DownloadEvent,
} from "./bridge";
import { plural } from "./plural";
import { resolveStream } from "./resolveStream";
import { type DownloadItem, type DownloadTrack, useLibrary } from "../stores/library";
import { type DownloadQuality, useSettings } from "../stores/settings";
import { type MenuItem, useUI } from "../stores/ui";

export const DOWNLOAD_ALL_CONFIRM = 25;
const GB_PER_SONG = 0.04;
const PROGRESS_TICK_MS = 500;
const EXPIRED_REASON = "HTTP 403";
const QUALITY_KBPS: Record<DownloadQuality, number | undefined> = {
  standard: 128,
  high: 192,
  lossless: undefined,
};

export type DownloadSource = {
  id: string;
  title: string;
  artist: string;
  thumb?: string | null;
  album?: string | null;
  duration?: number;
};

const retried = new Set<string>();

function notify(message: string, kind: "info" | "success" | "error" = "info") {
  useUI.getState().toast(message, kind);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function patch(id: string, changes: Partial<DownloadItem>) {
  useLibrary.getState().patchDownload(id, changes);
}

export function isDownloadable(id: string): boolean {
  return !id.startsWith("local:");
}

export function downloadedPath(id: string): string | null {
  const item = useLibrary.getState().downloads[id];
  return item?.status === "done" && item.path ? item.path : null;
}

function trackOf(source: DownloadSource): DownloadTrack {
  return {
    id: source.id,
    title: source.title,
    artist: source.artist,
    thumb: source.thumb ?? undefined,
    album: source.album ?? undefined,
    duration: source.duration ?? 0,
  };
}

async function queue(source: DownloadSource, dir?: string): Promise<void> {
  const library = useLibrary.getState();
  const track = trackOf(source);
  library.setDownload(source.id, {
    track,
    path: library.downloads[source.id]?.path ?? null,
    status: "queued",
    progress: 0,
    downloaded: 0,
    total: 0,
  });
  const { downloadDir, downloadQuality, exportDownloads } = useSettings.getState();
  try {
    const stream = await resolveStream(source.id, true, QUALITY_KBPS[downloadQuality], true);
    await downloadStart(track, stream.url, dir ?? downloadDir ?? undefined, exportDownloads);
  } catch (error) {
    patch(source.id, { status: "failed", progress: 0 });
    notify(`Download failed: ${describe(error)}`, "error");
  }
}

export async function startDownload(source: DownloadSource, dir?: string): Promise<void> {
  const existing = useLibrary.getState().downloads[source.id];
  if (existing?.status === "queued" || existing?.status === "downloading") return;
  if (existing?.status === "done") {
    notify("Already downloaded — see the Downloads view");
    return;
  }
  retried.delete(source.id);
  await queue(source, dir);
}

export async function cancelDownload(id: string): Promise<void> {
  try {
    await downloadCancel(id);
    useLibrary.getState().removeDownload(id);
  } catch (error) {
    notify(`Couldn't cancel the download: ${describe(error)}`, "error");
  }
}

export function createProgressBuffer(
  apply: (id: string, downloaded: number, total: number) => void,
  tickMs: number,
) {
  const latest = new Map<string, { downloaded: number; total: number }>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const discard = (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    latest.delete(id);
  };
  return {
    push(id: string, downloaded: number, total: number) {
      latest.set(id, { downloaded, total });
      if (timers.has(id)) return;
      timers.set(
        id,
        setTimeout(() => {
          const progress = latest.get(id);
          discard(id);
          if (progress) apply(id, progress.downloaded, progress.total);
        }, tickMs),
      );
    },
    discard,
  };
}

function applyProgress(id: string, downloaded: number, total: number) {
  if (!useLibrary.getState().downloads[id]) return;
  patch(id, {
    status: "downloading",
    downloaded,
    total,
    progress: total > 0 ? Math.min(1, downloaded / total) : 0,
  });
}

const progress = createProgressBuffer(applyProgress, PROGRESS_TICK_MS);

function anyActive(): boolean {
  return Object.values(useLibrary.getState().downloads).some(
    (item) => item.status === "queued" || item.status === "downloading",
  );
}

export function handleDownloadEvent(event: DownloadEvent): void {
  const { id } = event;
  const library = useLibrary.getState();
  const item = library.downloads[id];
  if (!item) return;
  switch (event.type) {
    case "start":
      applyProgress(id, 0, 0);
      return;
    case "progress":
      progress.push(id, event.downloaded ?? 0, event.total ?? 0);
      return;
    case "done":
      if (!event.path) return;
      progress.discard(id);
      retried.delete(id);
      patch(id, { status: "done", path: event.path, progress: 1 });
      if (!anyActive()) notify("Downloads finished", "success");
      return;
    case "failed":
      progress.discard(id);
      patch(id, { status: "failed", progress: 0 });
      if (event.reason === EXPIRED_REASON && !retried.has(id)) {
        retried.add(id);
        void queue(item.track);
        return;
      }
      retried.delete(id);
      notify(`Download failed: ${event.reason ?? "unknown error"}`, "error");
      return;
    case "cancelled":
      progress.discard(id);
      retried.delete(id);
      library.removeDownload(id);
      return;
    case "queued":
      return;
  }
}

export async function reconcileStaleDownloads(): Promise<void> {
  const rows = await downloadQueue().catch(() => null);
  if (!rows) return;
  const live = new Set(rows.map((row) => row.id));
  const library = useLibrary.getState();
  for (const [id, item] of Object.entries(library.downloads)) {
    if ((item.status === "queued" || item.status === "downloading") && !live.has(id)) {
      library.patchDownload(id, { status: "failed", progress: 0 });
    }
  }
}

export async function listenForDownloadProgress(): Promise<() => void> {
  await reconcileStaleDownloads();
  return listenDownloadEvents(handleDownloadEvent);
}

export function revealDownload(path: string): void {
  revealPath(path).catch((error: unknown) => notify(`Couldn't show the file: ${describe(error)}`, "error"));
}

export function openDownloadFolder(): void {
  openFolder(useSettings.getState().downloadDir ?? undefined).catch(() =>
    notify("Couldn't open the downloads folder", "error"),
  );
}

export async function chooseDownloadFolder(): Promise<void> {
  const picked = await pickFolder().catch(() => {
    notify("Couldn't open the folder picker", "error");
    return undefined;
  });
  if (!picked) return;
  useSettings.getState().setDownloadDir(picked);
  notify("Download folder updated", "success");
}

export function downloadAll(sources: DownloadSource[], what: string): void {
  const downloads = useLibrary.getState().downloads;
  const seen = new Set<string>();
  const pending = sources.filter((source) => {
    if (seen.has(source.id) || !isDownloadable(source.id)) return false;
    seen.add(source.id);
    const status = downloads[source.id]?.status;
    return status !== "done" && status !== "queued" && status !== "downloading";
  });
  if (pending.length === 0) {
    notify(`Everything in ${what} is already downloaded`);
    return;
  }
  const start = () => {
    notify(`Downloading ${plural(pending.length, "song", "songs")} from ${what}`);
    for (const source of pending) void startDownload(source);
  };
  if (pending.length <= DOWNLOAD_ALL_CONFIRM) {
    start();
    return;
  }
  const size = Math.max(0.1, Math.round(pending.length * GB_PER_SONG * 10) / 10);
  useUI.getState().openDialog({
    title: `Download ${plural(pending.length, "song", "songs")}?`,
    body: `That's roughly ${size} GB. They download two at a time; you can cancel any of them in Downloads.`,
    confirmLabel: "Download all",
    onConfirm: start,
  });
}

export function downloadMenuItems(item: DownloadItem): MenuItem[] {
  const { track, status, path } = item;
  const busy = status === "queued" || status === "downloading";
  const items: MenuItem[] = [];
  if (status === "failed") {
    items.push({ label: "Retry download", icon: RefreshIcon, onSelect: () => void startDownload(track) });
  }
  if (busy) {
    items.push({
      label: "Cancel download",
      icon: Cancel01Icon,
      danger: true,
      onSelect: () => void cancelDownload(track.id),
    });
  }
  if (status === "done" && path) {
    items.push({ label: "Show in folder", icon: FolderOpenIcon, onSelect: () => revealDownload(path) });
  }
  if (!busy) {
    items.push({
      label: "Remove from list",
      icon: Cancel01Icon,
      danger: true,
      separatorBefore: items.length > 0,
      onSelect: () => useLibrary.getState().removeDownload(track.id),
    });
  }
  return [
    ...items,
    { label: track.title, subject: { title: track.title, subtitle: track.artist, thumb: track.thumb ?? null } },
  ];
}
