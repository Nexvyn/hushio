import { castOpen, castSelect, castStatus, listenPlayerEvent } from "./bridge";
import { castTrack, isCasting, setCasting, stopCastingFromApp } from "./castState";
import { isLocalId, isNetworkId } from "./localLibrary";
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

function assertCastable(id: string): void {
  if (isLocalId(id) || isNetworkId(id)) throw new Error("Local and network songs can't be cast yet");
}

async function castCurrentTrack(): Promise<boolean> {
  const state = usePlayer.getState();
  const track = currentTrack(state);
  if (!track) return false;
  assertCastable(track.id);
  await castTrack(track.id, {
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
    setCasting(false);
    ui.toast("Stopped casting");
    return;
  }
  if (event.state === "failed") {
    choosing = false;
    setCasting(false);
    ui.toast("Couldn't connect to the Cast device", "error");
    return;
  }
  if (!choosing) return;
  choosing = false;
  try {
    if (!(await castCurrentTrack())) return;
    pauseLocal();
    setCasting(true);
    ui.toast(event.deviceName ? `Casting to ${event.deviceName}` : "Casting this song");
  } catch (error) {
    ui.toast(`Couldn't cast this song: ${errorText(error)}`, "error");
  }
}

export async function castNowPlaying(): Promise<"connected" | "choose" | "idle"> {
  const track = currentTrack(usePlayer.getState());
  if (!track) return "idle";
  assertCastable(track.id);
  await listenCastSessions();
  const status = await castStatus();
  if (!status.connected) {
    choosing = true;
    await castOpen();
    return "choose";
  }
  await castCurrentTrack();
  pauseLocal();
  setCasting(true);
  await castOpen();
  return "connected";
}

export async function castToDevice(id: string, alreadyConnected: boolean): Promise<void> {
  const track = currentTrack(usePlayer.getState());
  if (!track) return;
  assertCastable(track.id);
  await listenCastSessions();
  if (alreadyConnected) {
    await castCurrentTrack();
    pauseLocal();
    setCasting(true);
    return;
  }
  choosing = true;
  try {
    await castSelect(id);
  } catch (error) {
    choosing = false;
    throw error;
  }
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
  if (isCasting()) return stopCastingFromApp();
  try {
    const result = await castNowPlaying();
    if (result === "connected") useUI.getState().toast("Casting this song");
  } catch (error) {
    useUI.getState().toast(`Couldn't cast this song: ${errorText(error)}`, "error");
  }
}
