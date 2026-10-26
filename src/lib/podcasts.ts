import { getSession, withRetry } from "./innertube";
import { marketValue } from "./market";
import {
  parsePodcastEpisodeList,
  parsePodcastPage,
  parsePodcastShelves,
  podcastContinuation,
  type PodcastEpisode,
  type PodcastPage,
  type PodcastShelf,
} from "./podcastParse";

export const PODCASTS_TTL_MS = 3_600_000;
export const PODCAST_EPISODES_MAX = 100;
export const PODCAST_EXTRA_PAGES = 4;
const PODCASTS_BROWSE_ID = "FEmusic_non_music_audio";

let shelvesCache: { shelves: PodcastShelf[]; at: number } | null = null;

export function freshPodcasts(now = Date.now()): PodcastShelf[] | null {
  return shelvesCache && now - shelvesCache.at < PODCASTS_TTL_MS ? shelvesCache.shelves : null;
}

async function browse(browseId: string): Promise<unknown> {
  const { innertube } = await getSession(marketValue());
  const response = await withRetry(() => innertube.actions.execute("/browse", { browseId, client: "YTMUSIC" }));
  return response.data;
}

export async function loadPodcasts(now = Date.now()): Promise<PodcastShelf[]> {
  const fresh = freshPodcasts(now);
  if (fresh) return fresh;
  try {
    const shelves = parsePodcastShelves(await browse(PODCASTS_BROWSE_ID));
    if (shelves.length > 0) shelvesCache = { shelves, at: now };
    return shelves;
  } catch {
    return shelvesCache?.shelves ?? [];
  }
}

export async function getPodcast(browseId: string): Promise<PodcastPage> {
  const { innertube } = await getSession(marketValue());
  const first = await withRetry(() => innertube.actions.execute("/browse", { browseId, client: "YTMUSIC" }));
  const { page, continuation } = parsePodcastPage(first.data, browseId);
  const seen = new Set(page.episodes.map((episode) => episode.id));
  const episodes: PodcastEpisode[] = [...page.episodes];
  const show = { title: page.title, author: page.author };

  let token = continuation;
  for (let extra = 0; token && extra < PODCAST_EXTRA_PAGES; extra++) {
    const next = await withRetry(() =>
      innertube.actions.execute("/browse", { continuation: token, client: "YTMUSIC" }),
    ).catch(() => null);
    if (!next) break;
    const fresh = parsePodcastEpisodeList(next.data, show).filter((episode) => !seen.has(episode.id));
    if (fresh.length === 0) break;
    for (const episode of fresh) seen.add(episode.id);
    episodes.push(...fresh);
    token = podcastContinuation(next.data);
  }

  return { ...page, episodes: episodes.slice(0, PODCAST_EPISODES_MAX) };
}
