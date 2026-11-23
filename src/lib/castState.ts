import { castLoad, castPlayPause, castSeek, castStop, type CastLoad } from "./bridge";
import type { PlayMeta } from "./androidPlayback";
import { resolveStream } from "./resolveStream";
import { useUI } from "../stores/ui";

let casting = false;

export function setCasting(active: boolean): void {
  casting = active;
}

export function isCasting(): boolean {
  return casting;
}

export function controlCast(action: Promise<void>): void {
  action.catch((error: unknown) => {
    useUI.getState().toast("The Cast device didn't respond", "error");
    console.warn(`[hushio] cast control failed: ${String(error)}`);
  });
}

export function castPlayPauseFromApp(play: boolean): void {
  controlCast(castPlayPause(play));
}

export function castSeekFromApp(seconds: number): void {
  controlCast(castSeek(Math.round(seconds * 1000)));
}

function castContentType(mime: string | undefined): string {
  return mime?.split(";")[0]?.trim().toLowerCase() || "audio/mp4";
}

export async function castTrack(id: string, load: Omit<CastLoad, "url" | "contentType">): Promise<void> {
  const stream = await resolveStream(id, false, undefined, true);
  await castLoad({ url: stream.url, contentType: castContentType(stream.mime), ...load });
}

export function castTrackFromApp(id: string, title: string, fromSeconds: number, meta: PlayMeta): Promise<void> {
  return castTrack(id, {
    title,
    artist: meta.artist ?? "",
    artworkUrl: meta.artworkUrl ?? null,
    positionMs: Math.round(fromSeconds * 1000),
    playing: true,
  });
}

export function stopCastingFromApp(): void {
  setCasting(false);
  controlCast(castStop());
}
