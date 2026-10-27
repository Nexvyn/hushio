import { APP_SLUG } from "./app";
import { YT_ID } from "./importPlaylistFile";
import { trackShareLink } from "./shareLink";

export type ExportTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  duration?: number;
};

function shareable(tracks: readonly ExportTrack[]): ExportTrack[] {
  return tracks.filter((track) => YT_ID.test(track.id));
}

function jsonRow(track: ExportTrack) {
  const seconds = Math.round(track.duration ?? 0);
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    ...(track.album ? { album: track.album } : {}),
    ...(seconds ? { duration: seconds } : {}),
  };
}

export function playlistToJson(name: string, tracks: readonly ExportTrack[]): string {
  return JSON.stringify(
    { format: `${APP_SLUG}-playlist`, version: 1, name, tracks: shareable(tracks).map(jsonRow) },
    null,
    2,
  );
}

export function playlistToM3u8(name: string, tracks: readonly ExportTrack[]): string {
  const lines = ["#EXTM3U", `#PLAYLIST:${name.replace(/[\r\n]+/g, " ").trim()}`];
  for (const track of shareable(tracks)) {
    const seconds = Math.round(track.duration ?? 0);
    lines.push(`#EXTINF:${seconds || -1},${track.artist} - ${track.title}`, trackShareLink(track.id));
  }
  return `${lines.join("\n")}\n`;
}
