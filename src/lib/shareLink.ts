const YOUTUBE_MUSIC = "https://music.youtube.com";
const PLAYLIST_LINK = /^https:\/\/music\.youtube\.com\/playlist\?(?:[^#]*&)?list=([A-Za-z0-9_-]+)/;

export function playlistShareLink(playlistId: string): string {
  return `${YOUTUBE_MUSIC}/playlist?list=${encodeURIComponent(playlistId.replace(/^VL/, ""))}`;
}

export function parsePlaylistShareLink(text: string): string | null {
  return PLAYLIST_LINK.exec(text.trim())?.[1] ?? null;
}

export function trackShareLink(videoId: string): string {
  return `${YOUTUBE_MUSIC}/watch?v=${encodeURIComponent(videoId)}`;
}
