import { getArtistPage } from "./browse";
import { cachedSearchPage } from "./search";
import type { SearchRow } from "./searchParse";
import { artistNameKey, peekArtistMeta, rememberArtist } from "../stores/artistMeta";

export type ArtistCard = {
  id: string;
  name: string;
  thumb: string | null;
  description: string | null;
  subscriberCount: string | null;
  monthlyListeners: string | null;
};

type ArtistRef = { id: string; thumb: string | null };

const cards = new Map<string, Promise<ArtistCard>>();

export function loadArtistCard(id: string): Promise<ArtistCard> {
  const cached = cards.get(id);
  if (cached) return cached;
  const load = getArtistPage(id).then((page) => ({
    id,
    name: page.artist.name,
    thumb: page.artist.thumb,
    description: page.description,
    subscriberCount: page.subscriberCount,
    monthlyListeners: page.monthlyListeners,
  }));
  cards.set(id, load);
  load.catch(() => cards.delete(id));
  return load;
}

const ARTIST_SPLIT = /\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bx\b|\bwith\b)\s*/i;

async function findArtist(name: string): Promise<ArtistRef | null> {
  const known = peekArtistMeta(name);
  if (known) return { id: known.id, thumb: known.thumb };
  const page = await cachedSearchPage(name, "artists");
  const key = artistNameKey(name);
  const match = page.rows.find(
    (row): row is Extract<SearchRow, { kind: "browse" }> =>
      row.kind === "browse" && row.item.type === "artist" && artistNameKey(row.item.title) === key,
  );
  if (!match) return null;
  rememberArtist({ id: match.item.browseId, name: match.item.title, thumb: match.item.thumb });
  return { id: match.item.browseId, thumb: match.item.thumb };
}

export async function resolveArtistRef(name: string): Promise<ArtistRef | null> {
  const whole = await findArtist(name);
  if (whole) return whole;
  const first = name.split(ARTIST_SPLIT)[0]?.trim() ?? "";
  if (!first || first === name.trim()) return null;
  return findArtist(first);
}
