export const CLOCK_WINDOW_MS = 60_000;
export const CLOCK_SAMPLES = 32;
export const POSITION_TOLERANCE_MS = 2_000;
export const RESYNC_DEBOUNCE_MS = 1_000;

export type Member = {
  id: string;
  name: string;
  isHost: boolean;
  seenAt: number;
};

export type RoomState = {
  trackId: string | null;
  title: string;
  artist: string;
  thumb: string | null;
  position: number;
  playing: boolean;
  updatedAt: number;
};

export type Suggestion = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  thumb: string | null;
  fromName: string;
};

export type ListenMessage =
  | { type: "hello"; userId: string; name: string; at: number }
  | { type: "bye"; userId: string; at: number }
  | { type: "state"; userId: string; state: RoomState; at: number }
  | { type: "request"; userId: string; at: number }
  | { type: "suggest"; userId: string; name: string; suggestion: Suggestion; at: number }
  | { type: "approve"; userId: string; suggestionId: string; at: number }
  | { type: "reject"; userId: string; suggestionId: string; at: number };

export function parseMessage(raw: string): ListenMessage | null {
  try {
    const value = JSON.parse(raw) as ListenMessage;
    if (!value || typeof value !== "object" || typeof value.type !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

export function encodeMessage(message: ListenMessage): string {
  return JSON.stringify(message);
}

export class ServerClock {
  private samples: number[] = [];

  observe(serverTime: number, receivedAt: number): void {
    this.samples.push(receivedAt - serverTime);
    this.samples.sort((a, b) => a - b);
    if (this.samples.length > CLOCK_SAMPLES) this.samples = this.samples.slice(0, CLOCK_SAMPLES);
  }

  offset(now: number): number {
    const fresh = this.samples.filter((sample) => now - sample < CLOCK_WINDOW_MS);
    if (fresh.length === 0) return 0;
    return Math.min(...fresh);
  }

  elapsedSince(serverTime: number, now: number): number {
    return Math.max(0, now - this.offset(now) - serverTime);
  }

  reset(): void {
    this.samples = [];
  }
}

export function driftBetween(localPosition: number, remotePosition: number): number {
  return localPosition - remotePosition;
}

export function needsResync(localPosition: number, remotePosition: number): boolean {
  return Math.abs(driftBetween(localPosition, remotePosition)) > POSITION_TOLERANCE_MS;
}
