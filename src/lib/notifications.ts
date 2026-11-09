export type NotificationState = "granted" | "request" | "settings";

const STATES: readonly NotificationState[] = ["granted", "request", "settings"];

export function parseNotificationState(value: unknown): NotificationState {
  return STATES.find((state) => state === value) ?? "granted";
}

export function shouldAskAtPlayback(state: NotificationState, asked: boolean): boolean {
  return state === "request" && !asked;
}

export function showNotificationBanner(state: NotificationState, playing: boolean): boolean {
  return playing && state !== "granted";
}
