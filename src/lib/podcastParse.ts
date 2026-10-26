import type { Track } from "../types";
import { upgradeArtwork } from "./artwork";
import { asArray, at, collect, isRecord, text, type Json } from "./innertube";

const SHOW_BROWSE_PREFIX = "MPSP";
const SUBTITLE_SEPARATOR = "•";
const SPOKEN_LENGTH = /^(?:(\d+) hr)? ?(?:(\d+) min)? ?(?:(\d+) sec)?$/;
const DESCRIPTION_MAX = 500;
const DEFAULT_TITLE = "Podcast";
const HEADER_RENDERERS = [
  "musicResponsiveHeaderRenderer",
  "musicDetailHeaderRenderer",
  "musicImmersiveHeaderRenderer",
  "musicVisualHeaderRenderer",
];

export type PodcastShow = {
  id: string;
  title: string;
  thumb: string | null;
  author: string | null;
};

export type PodcastEpisode = Track & {
  episode: true;
  duration: number;
  album: string | null;
  published: string | null;
  description: string | null;
};

export type PodcastShelf = {
  title: string;
  shows: PodcastShow[];
  episodes: PodcastEpisode[];
};

export type PodcastPage = {
  id: string;
  title: string;
  author: string | null;
  thumb: string | null;
  description: string | null;
  episodes: PodcastEpisode[];
};

export type PodcastPageParse = {
  page: PodcastPage;
  continuation: string | null;
};

type ShowContext = { title: string; author: string | null };

function thumbOf(renderer: unknown): string | null {
  const thumbnails = asArray(at(collect(renderer, "musicThumbnailRenderer")[0], "thumbnail", "thumbnails"));
  const url = at(thumbnails.at(-1), "url");
  return typeof url === "string" ? upgradeArtwork(url) || null : null;
}

function segmentsOf(subtitle: string): string[] {
  return subtitle
    .split(SUBTITLE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function spokenSeconds(value: string): number {
  const match = SPOKEN_LENGTH.exec(value);
  if (!match || match.slice(1).every((part) => part === undefined)) return 0;
  const [hours = "0", minutes = "0", seconds = "0"] = match.slice(1);
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function episodeOf(renderer: Json, show?: ShowContext): PodcastEpisode | null {
  const id = at(renderer, "onTap", "watchEndpoint", "videoId");
  const title = text(renderer.title).trim();
  if (typeof id !== "string" || !title) return null;

  const segments = segmentsOf(text(renderer.subtitle));
  const last = segments.at(-1) ?? null;
  const description = text(renderer.description).trim();
  return {
    id,
    title,
    artist: show?.author || show?.title || segments[0] || DEFAULT_TITLE,
    thumb: thumbOf(renderer),
    episode: true,
    duration: segments.map(spokenSeconds).find((seconds) => seconds > 0) ?? 0,
    album: show?.title ?? null,
    published: last !== null && spokenSeconds(last) === 0 ? last : null,
    description: description ? description.slice(0, DESCRIPTION_MAX) : null,
  };
}

function showOf(card: Json): PodcastShow | null {
  const id = at(card, "navigationEndpoint", "browseEndpoint", "browseId");
  const title = text(card.title).trim();
  if (typeof id !== "string" || !id.startsWith(SHOW_BROWSE_PREFIX) || !title) return null;
  const author = text(card.subtitle).trim();
  return { id, title, thumb: thumbOf(card), author: author || null };
}

export function parsePodcastShelves(data: unknown): PodcastShelf[] {
  return collect(data, "musicCarouselShelfRenderer").flatMap((shelf) => {
    const title = text(at(shelf, "header", "musicCarouselShelfBasicHeaderRenderer", "title")).trim();
    const shows: PodcastShow[] = [];
    const episodes: PodcastEpisode[] = [];
    for (const entry of asArray(shelf.contents)) {
      const card = at(entry, "musicTwoRowItemRenderer");
      if (isRecord(card)) {
        const show = showOf(card);
        if (show) shows.push(show);
        continue;
      }
      const row = at(entry, "musicMultiRowListItemRenderer");
      const episode = isRecord(row) ? episodeOf(row) : null;
      if (episode) episodes.push(episode);
    }
    return title && (shows.length > 0 || episodes.length > 0) ? [{ title, shows, episodes }] : [];
  });
}

export function parsePodcastEpisodeList(data: unknown, show?: ShowContext): PodcastEpisode[] {
  return collect(data, "musicMultiRowListItemRenderer").flatMap((row) => {
    const episode = episodeOf(row, show);
    return episode ? [episode] : [];
  });
}

export function podcastContinuation(data: unknown): string | null {
  const token = collect(data, "nextContinuationData")
    .map((next) => at(next, "continuation"))
    .find((value): value is string => typeof value === "string");
  return token ?? null;
}

export function parsePodcastPage(data: unknown, id: string): PodcastPageParse {
  const header: Json = HEADER_RENDERERS.map((name) => collect(data, name)[0]).find(isRecord) ?? {};
  const title = text(header.title).trim() || DEFAULT_TITLE;
  const author = text(header.subtitle).trim() || null;
  const description = text(at(collect(data, "musicDescriptionShelfRenderer")[0], "description")).trim() || null;
  return {
    page: {
      id,
      title,
      author,
      thumb: thumbOf(header),
      description,
      episodes: parsePodcastEpisodeList(data, { title, author }),
    },
    continuation: podcastContinuation(data),
  };
}
