export type LaunchPayload = { kind: "text" | "file" | "link"; value: string };

export type LaunchTarget =
  | { kind: "video"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "file"; uri: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]+$/;
const PATH_VIDEO = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/;

function video(id: string | null | undefined): LaunchTarget | null {
  return id && VIDEO_ID.test(id) ? { kind: "video", id } : null;
}

function playlist(id: string | null): LaunchTarget | null {
  return id && LIST_ID.test(id) ? { kind: "playlist", id } : null;
}

function parseYouTubeUrl(url: URL): LaunchTarget | null {
  const host = url.hostname.replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (host === "youtu.be") return video(url.pathname.slice(1));
  const fromWatch = video(url.searchParams.get("v"));
  if (fromWatch) return fromWatch;
  const fromPath = PATH_VIDEO.exec(url.pathname);
  if (fromPath) return video(fromPath[1]);
  return playlist(url.searchParams.get("list"));
}

export function parseSharedText(text: string): LaunchTarget | null {
  for (const match of text.matchAll(URL_PATTERN)) {
    let url: URL;
    try {
      url = new URL(match[0]);
    } catch {
      continue;
    }
    const target = parseYouTubeUrl(url);
    if (target) return target;
  }
  return null;
}

export function parseAppLink(link: string): LaunchTarget | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "hushio:" || url.hostname !== "playlist") return null;
  return playlist(url.searchParams.get("list"));
}

export function launchTargetFor(payload: LaunchPayload): LaunchTarget | null {
  if (payload.kind === "text") return parseSharedText(payload.value);
  if (payload.kind === "link") return parseAppLink(payload.value);
  return payload.value ? { kind: "file", uri: payload.value } : null;
}
