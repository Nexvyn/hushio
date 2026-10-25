import { getSession, MARKET, withRetry } from "./innertube";
import {
  parseSearchPage,
  parseSearchSuggestions,
  SEARCH_FILTER_PARAMS,
  withSearchRows,
  type SearchFilter,
  type SearchPage,
  type SuggestionRow,
} from "./searchParse";

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 40;

export function createTtlCache<V>(ttlMs: number, max: number, now: () => number = () => Date.now()) {
  const entries = new Map<string, { value: V; at: number }>();
  return {
    get(key: string): V | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() - entry.at >= ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: V): void {
      entries.delete(key);
      entries.set(key, { value, at: now() });
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    clear(): void {
      entries.clear();
    },
  };
}

const pageCache = createTtlCache<SearchPage>(CACHE_TTL_MS, CACHE_MAX);
const suggestionCache = createTtlCache<SuggestionRow[]>(CACHE_TTL_MS, CACHE_MAX);

function cacheKey(filter: SearchFilter, query: string): string {
  return `${filter}:${query.trim().toLowerCase()}`;
}

export async function searchPage(query: string, filter: SearchFilter): Promise<SearchPage> {
  const q = query.trim();
  if (!q) return { rows: [], continuation: null };
  const params = SEARCH_FILTER_PARAMS[filter];
  const { innertube } = await getSession(MARKET);
  const response = await withRetry(() =>
    innertube.actions.execute("/search", { query: q, ...(params ? { params } : {}), client: "YTMUSIC" }),
  );
  return parseSearchPage(response.data, filter === "videos");
}

export async function searchMore(token: string, filter: SearchFilter): Promise<SearchPage> {
  const { innertube } = await getSession(MARKET);
  const response = await withRetry(() =>
    innertube.actions.execute("/search", { continuation: token, client: "YTMUSIC" }),
  );
  return parseSearchPage(response.data, filter === "videos");
}

export function peekSearchPage(query: string, filter: SearchFilter): SearchPage | undefined {
  if (!query.trim()) return undefined;
  return pageCache.get(cacheKey(filter, query));
}

export async function cachedSearchPage(query: string, filter: SearchFilter): Promise<SearchPage> {
  const cached = peekSearchPage(query, filter);
  if (cached) return cached;
  const page = await searchPage(query, filter);
  if (query.trim()) pageCache.set(cacheKey(filter, query), page);
  return page;
}

export async function getSuggestions(query: string): Promise<SuggestionRow[]> {
  const q = query.trim();
  if (!q) return [];
  const { innertube } = await getSession(MARKET);
  const response = await withRetry(() =>
    innertube.actions.execute("/music/get_search_suggestions", { input: q, client: "YTMUSIC" }),
  );
  return parseSearchSuggestions(response.data, q);
}

export function peekTypeAhead(query: string): SuggestionRow[] | undefined {
  if (!query.trim()) return undefined;
  return suggestionCache.get(cacheKey("all", query));
}

export async function typeAhead(query: string): Promise<SuggestionRow[]> {
  const q = query.trim();
  if (!q) return [];
  const cached = peekTypeAhead(q);
  if (cached) return cached;
  const [items, page] = await Promise.all([
    getSuggestions(q).catch(() => null),
    searchPage(q, "all").catch(() => null),
  ]);
  if (items === null && page === null) throw new Error("Type-ahead failed");
  const rows = withSearchRows(items ?? [], page?.rows ?? []);
  if (items !== null) suggestionCache.set(cacheKey("all", q), rows);
  return rows;
}

export function clearSearchCaches(): void {
  pageCache.clear();
  suggestionCache.clear();
}
