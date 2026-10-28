import { hash32 } from "./queue";

export const LYRICS_LOADING_LINES = [
  "Finding the words",
  "Tuning in",
  "Listening for the chorus",
  "Getting the lines ready",
  "Warming up the microphone",
  "Turning to the first verse",
] as const;

export function pickLyricsLine(lines: readonly string[], key: string): string {
  return lines[hash32(key) % lines.length];
}
