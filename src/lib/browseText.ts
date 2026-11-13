import { upgradeArtwork } from "./artwork";
import { fmtTotal } from "./format";
import { plural } from "./plural";

export const PAGE_TITLE_SIZE = ["text-[34px]", "text-[28px]", "text-[24px]"] as const;
export const ARTIST_TITLE_SIZE = ["text-[40px]", "text-[32px]", "text-[26px]"] as const;

const BRACKET_SUFFIX = /\s*[([][^)\]]*[)\]]\s*$/;
const FROM_SOURCE = /\(from\s+"?([^")]+?)"?\)\s*$/i;
const META_JOIN = " · ";

export function heroCover(thumb: string | null): string | null {
  return upgradeArtwork(thumb, 1200) || null;
}

export function titleStep(name: string): 0 | 1 | 2 {
  if (name.length <= 26) return 0;
  if (name.length <= 48) return 1;
  return 2;
}

export function pageTitleSize(name: string): string {
  return PAGE_TITLE_SIZE[titleStep(name)];
}

export function artistTitleSize(name: string): string {
  return ARTIST_TITLE_SIZE[titleStep(name)];
}

export function shortTitle(title: string): string {
  const cleaned = title.replace(BRACKET_SUFFIX, "").trim();
  return cleaned || title;
}

export function titleSource(title: string): string | null {
  const match = FROM_SOURCE.exec(title);
  return match ? match[1].trim() : null;
}

export function joinMeta(parts: (string | null | undefined | false)[]): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(META_JOIN);
}

export function albumMeta(releaseType: string, year: string | null, trackCount: number): string {
  return joinMeta([releaseType, year, plural(trackCount, "track", "tracks")]);
}

const CREDIT_SPLIT = /\s*[•·]\s*/;
const CREDIT_JOIN = " • ";
const PLATFORM_NAME = "youtube music";

export function ownerCredit(credit: string | null | undefined): string {
  return (credit ?? "")
    .split(CREDIT_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part !== "" && part.toLowerCase() !== PLATFORM_NAME)
    .join(CREDIT_JOIN);
}

export function playlistMeta(trackCount: number, totalSeconds: number): string {
  return joinMeta([plural(trackCount, "song", "songs"), totalSeconds > 0 ? fmtTotal(totalSeconds) : null]);
}

function firstWord(value: string | null): string | null {
  const word = value?.trim().split(/\s+/)[0];
  return word ? word : null;
}

export function subscriberChip(subscriberCount: string | null): string | null {
  const word = firstWord(subscriberCount);
  return word ? `${word} subscribers` : null;
}

export function listenersChip(monthlyListeners: string | null): string | null {
  const word = firstWord(monthlyListeners);
  return word ? `${word} monthly listeners` : null;
}

export function youtubeAlbumLink(albumId: string): string {
  return `https://music.youtube.com/browse/${albumId}`;
}

export function youtubePlaylistLink(playlistId: string): string {
  return `https://music.youtube.com/playlist?list=${playlistId}`;
}
