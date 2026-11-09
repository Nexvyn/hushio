import {
  listenPlayerEvent,
  playerPause,
  playerPlay,
  playerSeek,
  playerSetEq,
  playerSetQueue,
  playerSetSpeed,
  playerSetUrl,
  playerSetVolume,
} from "./bridge";
import {
  expiryOf,
  IDLE_SNAPSHOT,
  mediaEventsFor,
  queueItemFor,
  type MediaEvent,
  type PlayerSnapshot,
} from "./androidPlayback";
import { MEDIA_USER_AGENT, resolveStream } from "./resolveStream";
import { useUI } from "../stores/ui";

type StreamNeeded = { id: string; reason: string };
type PlayerFailure = { id: string; code: string; message: string; recoverable: boolean };

let last: PlayerSnapshot = IDLE_SNAPSHOT;
let currentTitle = "";

function headers(): Record<string, string> {
  return { "User-Agent": MEDIA_USER_AGENT };
}

function report(action: string): (error: unknown) => void {
  return (error) => console.warn(`[hushio] android ${action} failed: ${String(error)}`);
}

export async function androidPlayStream(id: string, title: string): Promise<void> {
  currentTitle = title;
  const stream = await resolveStream(id, false);
  const item = queueItemFor(id, title, stream.url, headers(), expiryOf(stream.url, Date.now()));
  await playerSetQueue([item], 0, 0);
  await playerPlay();
}

export function androidPlay(): Promise<void> {
  return playerPlay();
}

export function androidPause(): void {
  playerPause().catch(report("pause"));
}

export function androidSeek(seconds: number): void {
  playerSeek(Math.round(seconds * 1000)).catch(report("seek"));
}

export function androidSetVolume(value: number): void {
  playerSetVolume(value).catch(report("volume"));
}

export function androidSetSpeed(rate: number): void {
  playerSetSpeed(rate).catch(report("speed"));
}

export function androidSetEq(enabled: boolean, gains: readonly number[]): void {
  playerSetEq(enabled, gains).catch(report("eq"));
}

export function androidPosition(): number {
  return last.positionMs / 1000;
}

export function androidDuration(): number {
  return last.durationMs / 1000;
}

export function androidRate(): number {
  return last.speed;
}

async function refreshUrl(id: string): Promise<void> {
  try {
    const stream = await resolveStream(id, true);
    await playerSetUrl(id, stream.url, headers(), expiryOf(stream.url, Date.now()));
  } catch (error) {
    console.warn(`[hushio] stream refresh failed: ${String(error)}`);
    useUI.getState().toast(`Couldn't play "${currentTitle}"`, "error");
  }
}

function subscribe<T>(event: string, onEvent: (payload: T) => void): void {
  listenPlayerEvent<T>(event, onEvent).catch(report(`listen to ${event}`));
}

export function startAndroidEngine(dispatch: (type: MediaEvent | "ended") => void): void {
  subscribe<PlayerSnapshot>("player-state", (next) => {
    const before = last;
    last = next;
    for (const type of mediaEventsFor(before, next)) dispatch(type);
  });
  subscribe<unknown>("player-ended", () => dispatch("ended"));
  subscribe<StreamNeeded>("player-stream-needed", (event) => {
    void refreshUrl(event.id);
  });
  subscribe<PlayerFailure>("player-error", (event) => {
    console.warn(`[hushio] player error ${event.code}: ${event.message}`);
    useUI.getState().toast(`Couldn't play "${currentTitle}"`, "error");
  });
}
