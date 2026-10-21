import { registerStreamUrl, streamProxyPort } from "./bridge";
import { resolveStream } from "./resolveStream";

export const TEST_SONG_ID = "dQw4w9WgXcQ";

export const audio = new Audio();
audio.preload = "auto";
audio.crossOrigin = "anonymous";

export async function playStream(id: string): Promise<void> {
  const stream = await resolveStream(id);
  const port = await streamProxyPort();
  await registerStreamUrl(id, stream.url);
  audio.src = `http://127.0.0.1:${port}/?id=${encodeURIComponent(id)}`;
  await audio.play();
}

export function seekTo(seconds: number): void {
  if (!Number.isFinite(seconds)) return;
  const end = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds;
  audio.currentTime = Math.max(0, Math.min(seconds, end));
}
