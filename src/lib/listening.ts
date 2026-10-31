import { playbackEvent, type PlaybackKind, type WireTrack } from "./bridge";
import type { Track } from "../types";

type Session = { track: Track; duration: number; since: number | null };

let session: Session | null = null;

function wire(track: Track, duration: number): WireTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumb: track.thumb,
    ...(duration > 0 ? { duration } : {}),
    ...(track.episode ? { episode: track.episode } : {}),
  };
}

function send(type: PlaybackKind, deltaMs?: number) {
  const current = session;
  if (!current) return;
  const event = { type, track: wire(current.track, current.duration), ...(deltaMs === undefined ? {} : { deltaMs }) };
  playbackEvent(event).catch((error: unknown) => {
    console.warn(`[hushio] listening event failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function accrue(now: number, type: "pause" | "progress" | "stop") {
  const current = session;
  if (!current) return;
  const deltaMs = current.since !== null && !current.track.episode ? now - current.since : 0;
  if (current.since !== null) current.since = now;
  if (deltaMs > 0 || type === "stop") send(type, deltaMs);
  if (type === "stop") session = null;
}

export function startListen(track: Track, now = Date.now()) {
  if (session) pauseListen(now);
  session = { track, duration: 0, since: null };
  send("start");
}

export function resumeListen(now = Date.now()) {
  if (!session || session.since !== null) return;
  session.since = now;
  send("resume");
}

export function tick(now = Date.now()) {
  accrue(now, "progress");
}

export function pauseListen(now = Date.now()) {
  accrue(now, "pause");
  if (session) session.since = null;
}

export function stopListen(now = Date.now()) {
  accrue(now, "stop");
}

export function setListenDuration(seconds: number) {
  if (session) session.duration = seconds > 0 ? seconds : 0;
}
