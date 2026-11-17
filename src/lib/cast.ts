import { castLoad, castOpen, castStatus, listenPlayerEvent } from "./bridge";
import { resolveStream } from "./resolveStream";
import { currentTrack, usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

type CastSessionEvent = { state: "started" | "ended" | "failed"; deviceName?: string | null };

let choosing = false;
let listening: Promise<void> | null = null;

function listenCastSessions(): Promise<void> {
  if (!listening) {
    listening = listenPlayerEvent<CastSessionEvent>("cast-session", (event) => void onCastSession(event))
      .then(() => undefined)
      .catch((error: unknown) => {
        listening = null;
        throw error;
      });
  }
  return listening;
}

function castContentType(mime: string | undefined): string {
  return mime?.split(";")[0]?.trim().toLowerCase() || "audio/mp4";
}

async function castCurrentTrack(): Promise<boolean> {
  const state = usePlayer.getState();
  const track = currentTrack(state);
  if (!track) return false;
  const stream = await resolveStream(track.id, false, undefined, true);
  await castLoad({
    url: stream.url,
    contentType: castContentType(stream.mime),
    title: track.title,
    artist: track.artist,
    artworkUrl: track.thumb,
    positionMs: Math.round(state.position * 1000),
    playing: state.playing,
  });
  return true;
}

function pauseLocal(): void {
  if (usePlayer.getState().playing) usePlayer.getState().toggle();
}

async function onCastSession(event: CastSessionEvent): Promise<void> {
  const ui = useUI.getState();
  if (event.state === "ended") {
    choosing = false;
    ui.toast("Stopped casting");
    return;
  }
  if (event.state === "failed") {
    choosing = false;
    ui.toast("Couldn't connect to the Cast device", "error");
    return;
  }
  if (!choosing) return;
  choosing = false;
  try {
    if (!(await castCurrentTrack())) return;
    pauseLocal();
    ui.toast(event.deviceName ? `Casting to ${event.deviceName}` : "Casting this song");
  } catch (error) {
    ui.toast(`Couldn't cast this song: ${errorText(error)}`, "error");
  }
}

export async function castNowPlaying(): Promise<"connected" | "choose" | "idle"> {
  const track = currentTrack(usePlayer.getState());
  if (!track) return "idle";
  await listenCastSessions();
  const status = await castStatus();
  if (!status.connected) {
    choosing = true;
    await castOpen();
    return "choose";
  }
  await castCurrentTrack();
  pauseLocal();
  await castOpen();
  return "connected";
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch {
      return "unknown error";
    }
  }
  return "unknown error";
}

export async function castFromNowPlaying(): Promise<void> {
  try {
    const result = await castNowPlaying();
    if (result === "connected") useUI.getState().toast("Casting this song");
  } catch (error) {
    useUI.getState().toast(`Couldn't cast this song: ${errorText(error)}`, "error");
  }
}
