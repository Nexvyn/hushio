import { useCallback, useEffect, useRef, useState } from "react";
import {
  Album01Icon,
  Cancel01Icon,
  ChartLineData01Icon,
  Compass01Icon,
  GridViewIcon,
  Loading03Icon,
  MusicNote01Icon,
  PlayIcon,
  PlayListAddIcon,
  PlayListIcon,
  Search01Icon,
  SearchX,
  SparklesIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Artwork, BrowseRow } from "../components/SearchRows";
import { TrackRow } from "../components/TrackRow";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Icon } from "../components/Icon";
import { RecogniseSong } from "../components/RecogniseSong";
import { platform } from "../lib/bridge";
import { normalizeCredit } from "../lib/credits";
import { shellFor, useViewportWidth } from "../lib/layoutTier";
import { currentTrack, usePlayer } from "../stores/player";
import { trackMenuItems } from "../lib/trackActions";
import { APP_NAME } from "../lib/app";
import { cachedSearchPage, peekSearchPage, searchMore } from "../lib/search";
import { openRecentItem, playSong, recentSearchMenuItems, submitSearch } from "../lib/searchActions";
import { openMenuAtPointer, openMenuFromKey } from "../components/ContextMenu";
import {
  mergeRows,
  rowKey,
  searchSections,
  topResult,
  type SearchFilter,
  type SearchRow,
  type SearchSong,
} from "../lib/searchParse";
import { type View, useNavigation } from "../stores/navigation";
import { useRecentItems, useRecents, type RecentItem, type RecentKind } from "../stores/recents";
import { useUI } from "../stores/ui";

const SEARCH_DEBOUNCE_MS = 300;

const FILTER_TABS: { filter: SearchFilter; label: string; icon: IconSvgElement }[] = [
  { filter: "all", label: "All", icon: GridViewIcon },
  { filter: "songs", label: "Songs", icon: MusicNote01Icon },
  { filter: "videos", label: "Videos", icon: PlayIcon },
  { filter: "albums", label: "Albums", icon: Album01Icon },
  { filter: "artists", label: "Artists", icon: UserIcon },
  { filter: "playlists", label: "Playlists", icon: PlayListIcon },
];

const KIND_LABEL: Record<RecentKind, string> = {
  song: "Song",
  artist: "Artist",
  album: "Album",
  playlist: "Playlist",
};

type Results = {
  key: string;
  status: "idle" | "loading" | "ready" | "error";
  rows: SearchRow[];
  continuation: string | null;
  loadingMore: boolean;
};

const IDLE: Results = { key: "", status: "idle", rows: [], continuation: null, loadingMore: false };

function useSettledQuery(query: string): string {
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [query]);
  return settled;
}

function useSearchResults(query: string, filter: SearchFilter) {
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<Results>(IDLE);
  const sentinel = useRef<HTMLDivElement>(null);
  const key = `${filter}:${query}`;

  useEffect(() => {
    if (!query) {
      setResults(IDLE);
      return;
    }
    const cached = peekSearchPage(query, filter);
    if (cached) {
      setResults({ key, status: "ready", rows: cached.rows, continuation: cached.continuation, loadingMore: false });
      return;
    }
    let live = true;
    setResults({ key, status: "loading", rows: [], continuation: null, loadingMore: false });
    cachedSearchPage(query, filter).then(
      (page) => {
        if (live) setResults({ key, status: "ready", rows: page.rows, continuation: page.continuation, loadingMore: false });
      },
      () => {
        if (live) setResults({ key, status: "error", rows: [], continuation: null, loadingMore: false });
      },
    );
    return () => {
      live = false;
    };
  }, [key, query, filter, attempt]);

  const { status, continuation, loadingMore } = results;
  const loadMore = useCallback(() => {
    if (!continuation || loadingMore || status !== "ready") return;
    setResults((current) => (current.key === key ? { ...current, loadingMore: true } : current));
    searchMore(continuation, filter).then(
      (page) =>
        setResults((current) =>
          current.key !== key
            ? current
            : { ...current, rows: mergeRows(current.rows, page.rows), continuation: page.continuation, loadingMore: false },
        ),
      () => setResults((current) => (current.key !== key ? current : { ...current, loadingMore: false })),
    );
  }, [continuation, filter, key, loadingMore, status]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !continuation || loadingMore || status !== "ready") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [continuation, loadingMore, status, loadMore]);

  return {
    results,
    sentinel,
    retry: () => setAttempt((count) => count + 1),
  };
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="bt-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-[52px] items-center gap-3 px-2">
          <span className="h-10 w-10 shrink-0 rounded-md bg-wash" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-3 w-1/2 rounded bg-wash" />
            <span className="block h-2.5 w-1/3 rounded bg-wash" />
          </span>
        </div>
      ))}
    </div>
  );
}

function TopSongCard({ song, query }: { song: SearchSong; query: string }) {
  return (
    <div className="flex items-center gap-5 rounded-[11px] bg-panel p-4">
      <Artwork src={song.thumb} size="h-24 w-24" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[20px] font-semibold text-ink-1">{song.title}</p>
        <p className="truncate text-[13px] text-ink-2">{normalizeCredit(song.artist)}</p>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" className="gap-1.5" onClick={() => playSong(song, query)}>
            <Icon icon={PlayIcon} />
            Play
          </Button>
          <Button className="gap-1.5" onClick={() => useNavigation.getState().navigate({ name: "playlists" })}>
            <Icon icon={PlayListAddIcon} />
            Playlist
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecentlyOpened({ items }: { items: RecentItem[] }) {
  const remove = useRecentItems((state) => state.remove);
  const clear = useRecentItems((state) => state.clear);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-section text-ink-1">Recently opened</h2>
        <button
          type="button"
          onClick={clear}
          className="-mr-2 flex h-10 items-center rounded-md px-2 text-[12px] text-ink-2 transition-colors hover:text-ink-1 active:text-ink-1"
        >
          Clear all
        </button>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="group relative">
            <button
              type="button"
              onClick={() => openRecentItem(item)}
              className="flex h-16 w-full items-center gap-3 rounded-[10px] pr-11 text-left transition-colors hover:bg-wash"
            >
              <Artwork src={item.thumb} round={item.kind === "artist"} size="h-16 w-16" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink-1">{item.title}</span>
                <span className="block truncate text-[12px] text-ink-2">
                  {item.subtitle ? `${KIND_LABEL[item.kind]} · ${item.subtitle}` : KIND_LABEL[item.kind]}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remove "${item.title}" from recently opened`}
              onClick={() => remove(item.kind, item.id)}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-2 opacity-0 transition-opacity hover:bg-wash hover:text-ink-1 active:bg-pressed focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <Icon icon={Cancel01Icon} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentSearches({ searches }: { searches: string[] }) {
  const removeSearch = useRecents((state) => state.removeSearch);
  const clearSearches = useRecents((state) => state.clearSearches);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-section text-ink-1">Recent searches</h2>
        <button
          type="button"
          onClick={clearSearches}
          className="-mr-2 flex h-10 items-center rounded-md px-2 text-[12px] text-ink-2 transition-colors hover:text-ink-1 active:text-ink-1"
        >
          Clear all
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {searches.map((search) => (
          <li
            key={search}
            onContextMenu={(event) => openMenuAtPointer(event, () => recentSearchMenuItems(search))}
            onKeyDown={(event) => void openMenuFromKey(event, () => recentSearchMenuItems(search))}
            className="flex h-10 items-center rounded-full bg-wash text-[13px] text-ink-1"
          >
            <button type="button" onClick={() => submitSearch(search)} className="h-full pl-4 pr-2">
              {search}
            </button>
            <button
              type="button"
              aria-label={`Remove "${search}" from recent searches`}
              onClick={() => removeSearch(search)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-hover hover:text-ink-1 active:bg-pressed"
            >
              <Icon icon={Cancel01Icon} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const BROWSE_ENTRIES: { label: string; icon: IconSvgElement; view: View }[] = [
  { label: "Explore", icon: Compass01Icon, view: { name: "explore" } },
  { label: "Charts", icon: ChartLineData01Icon, view: { name: "charts" } },
  { label: "New releases", icon: SparklesIcon, view: { name: "newreleases" } },
];

function BrowseSection() {
  const navigate = useNavigation((state) => state.navigate);
  return (
    <section className="space-y-3">
      <h2 className="text-section text-ink-1">Browse</h2>
      <ul className="space-y-2">
        {BROWSE_ENTRIES.map((entry) => (
          <li key={entry.label}>
            <button
              type="button"
              onClick={() => navigate(entry.view)}
              className="flex h-16 w-full items-center gap-4 rounded-[12px] bg-panel px-4 text-left text-[16px] font-semibold text-ink-1 motion-safe:transition-colors motion-safe:duration-quick active:bg-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-wash text-ink-2">
                <Icon icon={entry.icon} />
              </span>
              {entry.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IdleSearch() {
  const items = useRecentItems((state) => state.items);
  const searches = useRecents((state) => state.searches);
  const width = useViewportWidth();
  const phone = platform === "android" && shellFor(width) === "phone";
  const empty = items.length === 0 && searches.length === 0;
  const shortcut = platform === "macos" ? "⌘F" : "Ctrl+F";
  return (
    <div className="space-y-10">
      {phone && <BrowseSection />}
      {empty ? (
        <section className="flex flex-col items-center py-16 text-center">
          <span className="mb-4 text-ink-2">
            <Icon icon={Search01Icon} />
          </span>
          <h2 className="text-section text-ink-1">{`Search ${APP_NAME}`}</h2>
          <p className="mt-1 max-w-md text-[12.5px] text-ink-2">
            {`Find songs, albums, artists and playlists. Press ${shortcut} anywhere to jump into search.`}
          </p>
        </section>
      ) : (
        <>
          {items.length > 0 && <RecentlyOpened items={items} />}
          {searches.length > 0 && <RecentSearches searches={searches} />}
        </>
      )}
    </div>
  );
}

function SongResult({ song, query }: { song: SearchSong; query: string }) {
  const current = usePlayer((state) => currentTrack(state)?.id);
  const playing = usePlayer((state) => state.playing);
  return (
    <TrackRow
      song={song}
      current={current === song.id}
      playing={playing}
      artwork
      dividerInset="after:left-[60px]"
      menu={() => trackMenuItems(song)}
      onPlay={() => playSong(song, query)}
    />
  );
}

function ResultRow({ row, query }: { row: SearchRow; query: string }) {
  if (row.kind === "browse") return <BrowseRow item={row.item} query={query} />;
  return <SongResult song={row.kind === "track" ? row.track : row.song} query={query} />;
}

export function SearchView() {
  const query = useUI((state) => state.searchQuery);
  const filter = useUI((state) => state.searchFilter);
  const setFilter = useUI((state) => state.setSearchFilter);
  const trimmed = query.trim();
  const settled = useSettledQuery(trimmed);
  const { results, sentinel, retry } = useSearchResults(settled, filter);

  if (!trimmed) {
    return (
      <>
        <RecogniseSong />
        <IdleSearch />
      </>
    );
  }

  const top = topResult(results.rows, filter);
  const sections = searchSections(top.rest, filter);
  const loading = results.status === "loading" || results.status === "idle";
  const announcement = loading
    ? "Loading"
    : results.status === "error"
      ? ""
      : results.rows.length === 0
        ? `No results for “${settled}”`
        : `${results.rows.length} ${results.rows.length === 1 ? "result" : "results"}`;

  return (
    <div className="space-y-4">
      <div className="flex h-10 items-center gap-2 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.filter}
            type="button"
            aria-pressed={filter === tab.filter}
            onClick={() => setFilter(tab.filter)}
            className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[12px] px-3.5 text-[13px] font-medium motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              filter === tab.filter ? "bg-accent text-on-accent" : "bg-wash text-ink-2 hover:bg-hover"
            }`}
          >
            <Icon icon={tab.icon} />
            {tab.label}
          </button>
        ))}
        {loading && (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center text-ink-2 bt-spin"
          >
            <Icon icon={Loading03Icon} />
          </span>
        )}
      </div>

      {results.status === "error" ? (
        <ErrorState
          title="Search didn't go through"
          message="This is usually a connection hiccup. Give it another try."
          action={{ label: "Try again", onClick: retry }}
        />
      ) : loading ? (
        <ListSkeleton rows={9} />
      ) : results.rows.length === 0 ? (
        <EmptyState icon={SearchX} title={`No results for “${settled}”`} message="Check the spelling or try another keyword." />
      ) : (
        <div className="animate-fade-in space-y-8">
          {top.browse && (
            <section className="space-y-2">
              <h2 className="text-section text-ink-1">Top result</h2>
              <div className="-mx-2">
                <BrowseRow item={top.browse} query={settled} />
              </div>
            </section>
          )}
          {top.song && (
            <section className="space-y-2">
              <h2 className="text-section text-ink-1">Top result</h2>
              <TopSongCard song={top.song} query={settled} />
            </section>
          )}
          {sections.map((section) => (
            <section key={section.title ?? "results"} className="space-y-1">
              {section.title && <h2 className="text-section text-ink-1">{section.title}</h2>}
              <ol className="-mx-2">
                {section.rows.map((row) => (
                  <ResultRow key={rowKey(row)} row={row} query={settled} />
                ))}
              </ol>
            </section>
          ))}
          {results.loadingMore && <ListSkeleton rows={3} />}
        </div>
      )}
      <p role="status" className="sr-only">{announcement}</p>
      <div ref={sentinel} aria-hidden="true" className="h-2" />
    </div>
  );
}
