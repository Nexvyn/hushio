import { upgradeArtwork } from "./artwork";
import { asArray, at, collect, getSession, MARKET, text, withRetry } from "./innertube";
import { FALLBACK_MOODS, MOOD_CATEGORY, type MoodEntry } from "./moods";

const MOODS_TTL_MS = 24 * 3_600_000;
const MIN_USABLE_MOODS = 6;
const COVER_COUNT = 2;

let moodCache: { moods: MoodEntry[]; at: number } | null = null;

export async function browse(browseId: string, params?: string): Promise<unknown> {
  const { innertube } = await getSession(MARKET);
  const response = await withRetry(() =>
    innertube.actions.execute("/browse", { browseId, ...(params ? { params } : {}), client: "YTMUSIC" }),
  );
  return response.data;
}

function colorOf(value: unknown): string | null {
  if (typeof value !== "number") return null;
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function thumbOf(node: unknown): string | null {
  const url = at(
    asArray(at(node, "thumbnailRenderer", "musicThumbnailRenderer", "thumbnail", "thumbnails")).at(-1),
    "url",
  );
  return upgradeArtwork(typeof url === "string" ? url : null) || null;
}

export function parseMoods(data: unknown): MoodEntry[] {
  const seen = new Set<string>();
  const moods: MoodEntry[] = [];
  for (const grid of collect(data, "gridRenderer")) {
    const section = text(at(grid, "header", "gridHeaderRenderer", "title")).trim() || null;
    for (const item of asArray(grid.items)) {
      const button = at(item, "musicNavigationButtonRenderer");
      const title = text(at(button, "buttonText")).trim();
      const endpoint = at(button, "clickCommand", "browseEndpoint");
      const browseId = at(endpoint, "browseId");
      if (!title || typeof browseId !== "string" || seen.has(title)) continue;
      seen.add(title);
      const params = at(endpoint, "params");
      moods.push({
        title,
        browseId,
        params: typeof params === "string" ? params : null,
        color: colorOf(at(button, "solid", "leftStripeColor")),
        section,
      });
    }
  }
  return moods;
}

export function parseMoodCovers(data: unknown, count: number): string[] {
  return collect(data, "musicTwoRowItemRenderer").slice(0, count).flatMap((item) => {
    const art = thumbOf(item);
    return art ? [art] : [];
  });
}

export async function getMoodCovers(browseId: string, params: string | null): Promise<string[]> {
  return parseMoodCovers(await browse(browseId, params ?? undefined), COVER_COUNT);
}

export async function getMoods(): Promise<MoodEntry[]> {
  const primary = await browse("FEmusic_moods_and_genres").then(parseMoods, () => []);
  if (primary.length >= MIN_USABLE_MOODS) return primary;
  const explore = await browse("FEmusic_explore").then(parseMoods, () => []);
  return explore.length > primary.length ? explore : primary;
}

export function freshMoods(now = Date.now()): MoodEntry[] | null {
  return moodCache && now - moodCache.at < MOODS_TTL_MS ? moodCache.moods : null;
}

export async function loadMoods(now = Date.now()): Promise<MoodEntry[]> {
  const fresh = freshMoods(now);
  if (fresh) return fresh;
  const usable = await getMoods().then(
    (moods) => moods.filter((mood) => mood.browseId.includes(MOOD_CATEGORY)),
    () => [],
  );
  if (usable.length < MIN_USABLE_MOODS) return FALLBACK_MOODS;
  moodCache = { moods: usable, at: now };
  return usable;
}
