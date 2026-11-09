export type PlayerRepeat = "off" | "all" | "one";

export type PlayerSnapshot = {
  playing: boolean;
  buffering: boolean;
  positionMs: number;
  durationMs: number;
  index: number;
  id: string | null;
  speed: number;
  repeat: PlayerRepeat;
  shuffle: boolean;
};

export type PlayerQueueItem = {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  url: string;
  headers: Record<string, string>;
  liked: boolean;
  expiresAtEpochMs: number | null;
  contentUri?: string;
};

export type MediaEvent = "play" | "pause" | "playing" | "waiting" | "timeupdate" | "durationchange";

export const IDLE_SNAPSHOT: PlayerSnapshot = {
  playing: false,
  buffering: false,
  positionMs: 0,
  durationMs: 0,
  index: 0,
  id: null,
  speed: 1,
  repeat: "off",
  shuffle: false,
};

const LINK_TTL_MS = 10 * 60 * 1000;
const EXPIRE_PARAM = /[?&/]expire[=/](\d{9,11})/;

export function isAndroidAgent(userAgent: string): boolean {
  return /Android/.test(userAgent);
}

export const ANDROID = isAndroidAgent(navigator.userAgent);

export function expiryOf(url: string, nowMs: number): number {
  const match = EXPIRE_PARAM.exec(url);
  return match ? Number(match[1]) * 1000 : nowMs + LINK_TTL_MS;
}

export function queueItemFor(
  id: string,
  title: string,
  url: string,
  headers: Record<string, string>,
  expiresAtEpochMs: number,
): PlayerQueueItem {
  return { id, title, artist: "", durationMs: 0, url, headers: { ...headers }, liked: false, expiresAtEpochMs };
}

export function mediaEventsFor(before: PlayerSnapshot, after: PlayerSnapshot): MediaEvent[] {
  const events: MediaEvent[] = [];
  if (!before.playing && after.playing) events.push("play");
  if (before.playing && !after.playing) events.push("pause");
  if (!before.buffering && after.buffering) events.push("waiting");
  if (after.playing && !after.buffering && (!before.playing || before.buffering)) events.push("playing");
  if (before.durationMs !== after.durationMs) events.push("durationchange");
  if (before.positionMs !== after.positionMs || before.index !== after.index) events.push("timeupdate");
  return events;
}
