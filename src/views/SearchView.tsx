import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VinylRecord, X, GridFour, CircleNotch, MusicNote, Play, ListPlus, Playlist, MagnifyingGlass, User, Globe, HardDrives, PuzzlePiece, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Artwork, BrowseCard, BrowseRow } from "../components/SearchRows";
import { TrackRow } from "../components/TrackRow";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Icon } from "../components/Icon";
import { BrowseGrid, DESKTOP_BROWSE } from "../components/BrowseGrid";
import { PhoneHeader } from "../components/phone/PhoneHeader";
import { PhoneProfileButton } from "../components/phone/PhoneProfileButton";
import { PhoneSearchField } from "../components/phone/PhoneSearchField";
import { PhoneBrowseRow, PhoneTopSong, PhoneTrackRow } from "../components/phone/PhoneSearchRows";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { platform } from "../lib/bridge";
import { normalizeCredit } from "../lib/credits";
import { usePhone } from "../lib/usePhone";
import { currentTrack, playFromRow, usePlayer } from "../stores/player";
import { trackMenuItems } from "../lib/trackActions";
import { APP_NAME } from "../lib/app";
import { cachedSearchPage, peekSearchPage, searchMore } from "../lib/search";
import { useJioSaavnSongs } from "../lib/useJioSaavnSongs";
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
import { useRecentItems, useRecents, type RecentItem, type RecentKind } from "../stores/recents";
import { useLocalLibrary } from "../stores/localLibrary";
import { useSettings } from "../stores/settings";
import type { AddonSource } from "../lib/addons/types";
import { addonsAvailable, deviceSongs, searchAddons, type SearchScope } from "../lib/searchScope";
import { useUI } from "../stores/ui";
import { SkeletonSwap } from "../components/SkeletonSwap";

const SEARCH_DEBOUNCE_MS = 300;

const HEADING = "text-section text-ink-1";
const PHONE_HEADING = "font-title text-card-title leading-[26px] font-bold tracking-[-0.02em] text-ink-1";
const PHONE_RECENT_LIMIT = 6;

const FILTER_TABS: { filter: SearchFilter; label: string; icon: PhosphorIcon }[] = [
  { filter: "all", label: "All", icon: GridFour },
  { filter: "songs", label: "Songs", icon: MusicNote },
  { filter: "videos", label: "Videos", icon: Play },
  { filter: "albums", label: "Albums", icon: VinylRecord },
  { filter: "artists", label: "Artists", icon: User },
  { filter: "playlists", label: "Playlists", icon: Playlist },
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
  moreError?: boolean;
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
    setResults((current) => (current.key === key ? { ...current, loadingMore: true, moreError: false } : current));
    searchMore(continuation, filter).then(
      (page) =>
        setResults((current) =>
          current.key !== key
            ? current
            : { ...current, rows: mergeRows(current.rows, page.rows), continuation: page.continuation, loadingMore: false },
        ),
      () => setResults((current) => (current.key !== key ? current : { ...current, loadingMore: false, moreError: true })),
    );
  }, [continuation, filter, key, loadingMore, status]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !continuation || loadingMore || results.moreError || status !== "ready") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [continuation, loadingMore, status, loadMore, results.moreError]);

  return {
    results,
    sentinel,
    loadMore,
    retry: () => setAttempt((count) => count + 1),
  };
}

function ListSkeleton({ rows, phone = false }: { rows: number; phone?: boolean }) {
  return (
    <div aria-hidden="true" className="bt-skeleton">
      {Array.from({ length: rows }, (_, index) =>
        phone ? (
          <div key={index} className="flex h-14 items-center gap-3">
            <span className="h-12 w-12 shrink-0 rounded-[6px] bg-wash" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-3 w-1/2 rounded bg-wash" />
              <span className="block h-2.5 w-1/3 rounded bg-wash" />
            </span>
          </div>
        ) : (
          <div key={index} className="flex h-[52px] items-center gap-3 px-2">
            <span className="h-10 w-10 shrink-0 rounded-md bg-wash" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-3 w-1/2 rounded bg-wash" />
              <span className="block h-2.5 w-1/3 rounded bg-wash" />
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function TopSongCard({ song, query }: { song: SearchSong; query: string }) {
  return (
    <div className="flex items-center gap-5 rounded-[11px] bg-panel p-4">
      <Artwork src={song.thumb} size="h-24 w-24" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-card-title font-semibold text-ink-1">{song.title}</p>
        <p className="truncate text-meta text-ink-2">{normalizeCredit(song.artist)}</p>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" className="gap-1.5" onClick={() => playSong(song, query)}>
            <Icon icon={Play} />
            Play
          </Button>
          <Button className="gap-1.5" onClick={() => useUI.getState().openPlaylistPicker([song])}>
            <Icon icon={ListPlus} />
            Add to playlist
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecentlyOpened({ items }: { items: RecentItem[] }) {
  const phone = usePhone();
  const remove = useRecentItems((state) => state.remove);
  const clear = useRecentItems((state) => state.clear);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className={phone ? PHONE_HEADING : HEADING}>Recently opened</h2>
        <button
          type="button"
          onClick={clear}
          className={
            phone
              ? "-mr-2 flex h-11 items-center rounded-[10px] px-2 text-meta text-ink-2 active:text-ink-1"
              : "-mr-2 flex h-10 items-center rounded-md px-2 text-meta text-ink-2 transition-colors hover:text-ink-1 active:text-ink-1"
          }
        >
          Clear all
        </button>
      </div>
      <ul className={phone ? "flex flex-col" : "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2"}>
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="group relative">
            <button
              type="button"
              onClick={() => openRecentItem(item)}
              className={
                phone
                  ? "flex h-14 w-full items-center gap-3 pr-12 text-left motion-safe:transition-opacity active:opacity-70"
                  : "flex h-16 w-full items-center gap-3 rounded-[10px] pr-11 text-left transition-colors hover:bg-wash"
              }
            >
              <Artwork
                src={item.thumb}
                round={item.kind === "artist"}
                size={phone ? "h-12 w-12" : "h-16 w-16"}
                radius={phone && item.kind !== "artist" ? "rounded-[6px]" : undefined}
              />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-ink-1 ${phone ? "text-body leading-[22px] font-normal" : "text-meta font-medium"}`}>
                  {item.title}
                </span>
                <span className={`block truncate text-ink-2 ${phone ? "text-meta leading-[18px]" : "text-meta"}`}>
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
              <Icon icon={X} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentSearches({ searches }: { searches: string[] }) {
  const phone = usePhone();
  const removeSearch = useRecents((state) => state.removeSearch);
  const clearSearches = useRecents((state) => state.clearSearches);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className={phone ? PHONE_HEADING : HEADING}>Recent searches</h2>
        <button
          type="button"
          onClick={clearSearches}
          className={
            phone
              ? "-mr-2 flex h-11 items-center rounded-[10px] px-2 text-meta text-ink-2 active:text-ink-1"
              : "-mr-2 flex h-10 items-center rounded-md px-2 text-meta text-ink-2 transition-colors hover:text-ink-1 active:text-ink-1"
          }
        >
          Clear all
        </button>
      </div>
      <ul className={phone ? "no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" : "flex flex-wrap gap-2"}>
        {searches.map((search) => (
          <li
            key={search}
            onContextMenu={(event) => openMenuAtPointer(event, () => recentSearchMenuItems(search))}
            onKeyDown={(event) => void openMenuFromKey(event, () => recentSearchMenuItems(search))}
            className={
              phone
                ? "flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-[10px] bg-wash text-body text-ink-1"
                : "flex h-10 items-center rounded-full bg-wash text-meta text-ink-1"
            }
          >
            <button
              type="button"
              onClick={() => submitSearch(search)}
              className={phone ? "-my-[5px] flex h-11 items-center pl-3 pr-1" : "h-full pl-4 pr-2"}
            >
              {search}
            </button>
            <button
              type="button"
              aria-label={`Remove "${search}" from recent searches`}
              onClick={() => removeSearch(search)}
              className={
                phone
                  ? "-my-[5px] flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-hover hover:text-ink-1 active:bg-pressed"
                  : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-hover hover:text-ink-1 active:bg-pressed"
              }
            >
              <Icon icon={X} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PhoneIdleSearch({ items, searches }: { items: RecentItem[]; searches: string[] }) {
  return (
    <div className="mt-4 space-y-7">
      {searches.length > 0 && <RecentSearches searches={searches} />}
      {items.length > 0 && <RecentlyOpened items={items.slice(0, PHONE_RECENT_LIMIT)} />}
    </div>
  );
}

function IdleSearch() {
  const items = useRecentItems((state) => state.items);
  const searches = useRecents((state) => state.searches);
  const phone = usePhone();
  if (phone) return <PhoneIdleSearch items={items} searches={searches} />;
  const empty = items.length === 0 && searches.length === 0;
  const shortcut = platform === "macos" ? "⌘F" : "Ctrl+F";
  return (
    <div className="space-y-10">
      {empty ? (
        <section className="flex flex-col items-center py-16 text-center">
          <span className="mb-4 text-ink-2">
            <Icon icon={MagnifyingGlass} />
          </span>
          <h2 className={HEADING}>{`Search ${APP_NAME}`}</h2>
          <p className="mt-1 max-w-md text-meta text-ink-2">
            {`Find songs, albums, artists and playlists. Press ${shortcut} anywhere to jump into search.`}
          </p>
        </section>
      ) : (
        <>
          {items.length > 0 && <RecentlyOpened items={items} />}
          {searches.length > 0 && <RecentSearches searches={searches} />}
        </>
      )}
      <BrowseGrid items={DESKTOP_BROWSE} />
    </div>
  );
}

const SCOPE_TABS: { scope: SearchScope; label: string; icon: PhosphorIcon }[] = [
  { scope: "online", label: "Online", icon: Globe },
  { scope: "device", label: "On device", icon: HardDrives },
  { scope: "addons", label: "Add-ons", icon: PuzzlePiece },
];

function ScopeControl({
  scope,
  scopes,
  onPick,
  phone,
}: {
  scope: SearchScope;
  scopes: SearchScope[];
  onPick: (scope: SearchScope) => void;
  phone: boolean;
}) {
  const tabs = SCOPE_TABS.filter((tab) => scopes.includes(tab.scope));
  if (phone) {
    return (
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {tabs.map((tab) => (
          <button
            key={tab.scope}
            type="button"
            aria-pressed={scope === tab.scope}
            onClick={() => onPick(tab.scope)}
            className={`relative inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-[10px] px-3 text-body font-medium before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-[''] motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              scope === tab.scope ? "bg-accent text-on-accent" : "bg-wash text-ink-2 hover:bg-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Search where" className="inline-flex h-10 items-center gap-1 rounded-[12px] bg-wash p-1">
      {tabs.map((tab) => (
        <button
          key={tab.scope}
          type="button"
          aria-pressed={scope === tab.scope}
          onClick={() => onPick(tab.scope)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-meta font-medium motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
            scope === tab.scope ? "bg-accent text-on-accent" : "text-ink-2 hover:text-ink-1"
          }`}
        >
          <Icon icon={tab.icon} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

type AddonSongs = { key: string; status: "loading" | "ready" | "error"; songs: SearchSong[] };

function useAddonSongs(query: string, sources: AddonSource[]) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AddonSongs>({ key: "", status: "loading", songs: [] });
  const key = `${attempt}:${query}:${sources.map((source) => source.id).join("|")}`;

  useEffect(() => {
    if (!query) return;
    let live = true;
    setState({ key, status: "loading", songs: [] });
    searchAddons(sources, query).then(
      (songs) => {
        if (live) setState({ key, status: "ready", songs });
      },
      () => {
        if (live) setState({ key, status: "error", songs: [] });
      },
    );
    return () => {
      live = false;
    };
  }, [key, query, sources]);

  const current = state.key === key;
  return {
    status: current ? state.status : "loading",
    songs: current ? state.songs : [],
    retry: () => setAttempt((count) => count + 1),
  };
}

function ScopeIdle({ scope }: { scope: SearchScope }) {
  if (scope === "device") {
    return <EmptyState icon={HardDrives} title="Search this device" message="Type a song, artist or album from your local music." />;
  }
  return (
    <EmptyState icon={PuzzlePiece} title="Search your add-ons" message="Type a song to search the add-ons you turned on in Settings." />
  );
}

function ScopedResults({ scope, query, sources, phone }: { scope: SearchScope; query: string; sources: AddonSource[]; phone: boolean }) {
  const localTracks = useLocalLibrary((state) => state.library.tracks);
  const localLoaded = useLocalLibrary((state) => state.loaded);
  const addons = useAddonSongs(scope === "addons" ? query : "", sources);
  const current = usePlayer((state) => currentTrack(state)?.id);
  const playing = usePlayer((state) => state.playing);
  const songs = useMemo(
    () => (scope === "device" ? deviceSongs(localTracks, query) : addons.songs),
    [scope, localTracks, query, addons.songs],
  );

  if (scope === "online") return null;
  if (!query) return <ListSkeleton rows={6} phone={phone} />;
  if (scope === "device" && !localLoaded) return <ListSkeleton rows={6} phone={phone} />;
  if (scope === "addons" && addons.status === "loading") return <ListSkeleton rows={6} phone={phone} />;
  if (scope === "addons" && addons.status === "error") {
    return (
      <ErrorState
        title="Add-on search didn't go through"
        message="None of the enabled add-ons answered. Check them in Settings and try again."
        action={{ label: "Try again", onClick: addons.retry }}
      />
    );
  }
  if (songs.length === 0) {
    if (scope === "device" && localTracks.length === 0) {
      return <EmptyState icon={HardDrives} title="No music on this device yet" message="Add a folder in Local music, then search it here." />;
    }
    return (
      <EmptyState
        icon={MagnifyingGlass}
        title={`No results for “${query}”`}
        message={scope === "device" ? "Only songs in your local folders are searched here." : "The enabled add-ons had nothing for this search."}
      />
    );
  }
  return (
    <ol className={phone ? "animate-fade-in" : "-mx-2 animate-fade-in"}>
      {songs.map((song, index) =>
        phone ? (
          <PhoneSongRow
            key={song.id}
            index={index}
            song={song}
            current={song.id === current}
            playing={playing}
            menu={() => trackMenuItems(song)}
            onPlay={() => playFromRow(songs, index)}
          />
        ) : (
          <TrackRow
            key={song.id}
            index={index}
            song={song}
            current={song.id === current}
            playing={playing}
            artwork
            dividerInset="after:left-[60px]"
            menu={() => trackMenuItems(song)}
            onPlay={() => playFromRow(songs, index)}
          />
        ),
      )}
    </ol>
  );
}

function PhoneFilterChips({ filter, onPick }: { filter: SearchFilter; onPick: (filter: SearchFilter) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {FILTER_TABS.map((tab) => (
        <button
          key={tab.filter}
          type="button"
          aria-pressed={filter === tab.filter}
          onClick={() => onPick(tab.filter)}
          className={`relative inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-[10px] px-3 text-body font-medium before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-[''] motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
            filter === tab.filter ? "bg-accent text-on-accent" : "bg-wash text-ink-2 hover:bg-hover"
          }`}
        >
          {tab.label}
        </button>
      ))}
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

function ResultRow({ row, query, phone }: { row: SearchRow; query: string; phone: boolean }) {
  if (phone) {
    if (row.kind === "browse") {
      return (
        <li>
          <PhoneBrowseRow item={row.item} query={query} />
        </li>
      );
    }
    return <PhoneTrackRow song={row.kind === "track" ? row.track : row.song} query={query} />;
  }
  if (row.kind === "browse") return <BrowseRow item={row.item} query={query} />;
  return <SongResult song={row.kind === "track" ? row.track : row.song} query={query} />;
}

export function SearchView() {
  const query = useUI((state) => state.searchQuery);
  const filter = useUI((state) => state.searchFilter);
  const setFilter = useUI((state) => state.setSearchFilter);
  const phone = usePhone();
  const trimmed = query.trim();
  const settled = useSettledQuery(trimmed);
  const addonSources = useSettings((state) => state.addonSources);
  const addonsOn = addonsAvailable(addonSources);
  const [picked, setScope] = useState<SearchScope>("online");
  const scope: SearchScope = picked === "addons" && !addonsOn ? "online" : picked;
  const online = scope === "online";
  const { results, sentinel, retry, loadMore } = useSearchResults(online ? settled : "", filter);
  const jiosaavnOn = useSettings((state) => state.jiosaavnEnabled);
  const jiosaavnSongs = useJioSaavnSongs(online ? settled : "", jiosaavnOn && (filter === "all" || filter === "songs"));
  const jiosaavnRows: SearchRow[] = jiosaavnSongs.map((track) => ({ kind: "track", track }));
  const scopes: SearchScope[] = addonsOn ? ["online", "device", "addons"] : ["online", "device"];
  const scopeBar = (
    <div className={phone ? "mt-3" : undefined}>
      <ScopeControl scope={scope} scopes={scopes} onPick={setScope} phone={phone} />
    </div>
  );

  const field = phone ? (
    <PhoneSearchField suggest={online} />
  ) : null;
  const header = phone && !trimmed ? <PhoneHeader title="Search" actions={<PhoneProfileButton />} /> : null;

  if (!trimmed) {
    const idle = online ? <IdleSearch /> : <ScopeIdle scope={scope} />;
    if (!phone) {
      return (
        <div className="space-y-10">
          {scopeBar}
          {idle}
        </div>
      );
    }
    return (
      <div>
        {header}
        {field}
        {scopeBar}
        {idle}
      </div>
    );
  }

  if (!online) {
    const scoped = (
      <div className={phone ? "mt-3 space-y-4" : "space-y-4"}>
        {scopeBar}
        <ScopedResults scope={scope} query={settled} sources={addonSources} phone={phone} />
      </div>
    );
    if (!phone) return scoped;
    return (
      <div>
        {field}
        {scoped}
      </div>
    );
  }

  const top = topResult(results.rows, filter);
  const sections = [
    ...searchSections(top.rest, filter),
    ...(jiosaavnRows.length > 0 ? [{ title: "JioSaavn", rows: jiosaavnRows }] : []),
  ];
  const loading = trimmed !== settled || results.key !== `${filter}:${settled}` || results.status === "loading" || results.status === "idle";
  const announcement = loading
    ? "Loading"
    : results.status === "error"
      ? ""
      : results.rows.length === 0
        ? `No results for “${settled}”`
        : `${results.rows.length} ${results.rows.length === 1 ? "result" : "results"}`;

  const body = (
    <div className={phone ? "mt-3 space-y-4" : "space-y-4"}>
      {scopeBar}
      {phone ? (
        <PhoneFilterChips filter={filter} onPick={setFilter} />
      ) : (
        <div className="flex h-10 items-center gap-2 overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.filter}
              type="button"
              aria-pressed={filter === tab.filter}
              onClick={() => setFilter(tab.filter)}
              className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[12px] px-3.5 text-meta font-medium motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
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
              <Icon icon={CircleNotch} />
            </span>
          )}
        </div>
      )}

      <SkeletonSwap loading={loading} skeleton={<ListSkeleton rows={9} phone={phone} />}>
      {loading ? null : results.status === "error" ? (
        <ErrorState
          title="Search didn't go through"
          message="Search is unavailable. Check your connection and try again. If other pages work, the music service may be temporarily unavailable."
          action={{ label: "Try again", onClick: retry }}
        />
      ) : results.rows.length === 0 && jiosaavnRows.length === 0 ? (
        <EmptyState icon={MagnifyingGlass} title={`No results for “${settled}”`} message="Check the spelling or try another keyword." />
      ) : (
        <div className={phone ? "animate-fade-in space-y-7" : "animate-fade-in space-y-8"}>
          {top.browse && (
            <section className={phone ? "space-y-3" : "space-y-2"}>
              <h2 className={phone ? PHONE_HEADING : HEADING}>Top result</h2>
              {phone ? (
                <PhoneBrowseRow item={top.browse} query={settled} featured />
              ) : (
                <div className="-mx-2">
                  <BrowseRow item={top.browse} query={settled} />
                </div>
              )}
            </section>
          )}
          {top.song && (
            <section className={phone ? "space-y-3" : "space-y-2"}>
              <h2 className={phone ? PHONE_HEADING : HEADING}>Top result</h2>
              {phone ? <PhoneTopSong song={top.song} query={settled} /> : <TopSongCard song={top.song} query={settled} />}
            </section>
          )}
          {sections.map((section) => {
            const cards = !phone && section.rows.length > 0 && section.rows.every((row) => row.kind === "browse");
            return (
              <section key={section.title ?? "results"} className={phone ? "space-y-3" : "space-y-1"}>
                {section.title && <h2 className={phone ? PHONE_HEADING : HEADING}>{section.title}</h2>}
                {cards ? (
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-x-4 gap-y-6 pt-2">
                    {section.rows.map((row) => (
                      <li key={rowKey(row)} className="min-w-0">
                        {row.kind === "browse" && <BrowseCard item={row.item} query={settled} />}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ol className={phone ? undefined : "-mx-2"}>
                    {section.rows.map((row) => (
                      <ResultRow key={rowKey(row)} row={row} query={settled} phone={phone} />
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
          {results.loadingMore && <ListSkeleton rows={3} phone={phone} />}
        </div>
      )}
      </SkeletonSwap>
      {results.moreError && !loading && (
        <ErrorState title="Couldn't load more results" message="Your current results are still available."
          action={{ label: "Try again", onClick: loadMore }} />
      )}
      <p role="status" className="sr-only">{announcement}</p>
      <div ref={sentinel} aria-hidden="true" className="h-2" />
    </div>
  );

  if (!phone) return body;
  return (
    <div>
      {header}
      {field}
      {body}
    </div>
  );
}
