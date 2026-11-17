import { prefetchStream, warmStreamSession } from "./resolveStream";
import { addonsEnabled } from "./addons/resolve";
import { downloadedPath } from "./downloads";
import { isLocalId, isNetworkId } from "./localLibrary";
import { currentStreamBitrate } from "./streamingQuality";
import { useSettings } from "../stores/settings";

const FIRST_TRACKS = 3;
const AHEAD_TRACKS = 2;

function speculative(id: string): boolean {
  if (useSettings.getState().dataSaver) return false;
  if (isLocalId(id) || isNetworkId(id) || downloadedPath(id)) return false;
  return !addonsEnabled(currentStreamBitrate() === undefined);
}

export function prefetchTrack(id: string): Promise<void> {
  if (!speculative(id)) return Promise.resolve();
  return prefetchStream(id, currentStreamBitrate());
}

export function prefetchAhead(ids: readonly string[]): void {
  for (const id of ids.slice(0, AHEAD_TRACKS)) void prefetchTrack(id);
}

function whenIdle(task: () => void): void {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(task, { timeout: 2000 });
  else setTimeout(task, 0);
}

export function prefetchFirst(ids: readonly string[]): void {
  const first = ids.filter(Boolean).slice(0, FIRST_TRACKS);
  if (first.length === 0) return;
  whenIdle(() => {
    void (async () => {
      for (const id of first) await prefetchTrack(id);
    })();
  });
}

export function warmPlayback(): void {
  whenIdle(() => void warmStreamSession());
}
