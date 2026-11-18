import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useTransform } from "motion/react";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FeedSectionView, featuredFrom } from "../components/FeedSections";
import { QuickTiles } from "../components/HomeShelves";
import { PageHeader } from "../components/PageHeader";
import { PhoneFeatured, type FeaturedItem } from "../components/phone/PhoneFeatured";
import { TEST_SONG_ID } from "../lib/audio";
import { PhoneProfileButton } from "../components/phone/PhoneProfileButton";
import { PhoneQuickTiles } from "../components/phone/PhoneShelf";
import { greetingFor } from "../lib/greeting";
import { refreshHome, type HomeShelf } from "../lib/home";
import { orderHomeSections } from "../lib/homeSections";
import { marketValue } from "../lib/market";
import { quickTilesFrom } from "../lib/quickTiles";
import { freshHomeShelves } from "../lib/homeStream";
import { useHomeStream } from "../lib/useHomeStream";
import { usePhone } from "../lib/usePhone";
import { useHomeFeed } from "../lib/useHomeFeed";
import { useHomeCache } from "../stores/homeCache";
import { useNavigation } from "../stores/navigation";
import { useRecentItems, type RecentItem } from "../stores/recents";
import type { MenuItem } from "../stores/ui";
import { browseMenuItems } from "../lib/browseActions";
import { songOf, trackMenuItems } from "../lib/trackActions";
import { useSettings } from "../stores/settings";
import { useLibrary } from "../stores/library";
import { useHomeEngagement } from "../stores/homeEngagement";
import { hiddenNow } from "../lib/engagement";
import { DeferredSection } from "../components/DeferredSection";
import { SkeletonFade } from "../components/SkeletonSwap";
import { PullIndicator } from "../components/phone/PullIndicator";
import { HomeReveal } from "../components/phone/HomeReveal";
import { claimHomeIntro, type HomeRevealPlan } from "../lib/homeIntro";

import { usePullToRefresh } from "../components/phone/usePullToRefresh";
import { HomeFeature } from "../components/HomeFeature";
import type { FeedSection } from "../lib/feed";
import "../styles/home.css";

const TILE_LIMIT = 6;
const DESKTOP_TILE_LIMIT = 8;
const NO_SHELVES: HomeShelf[] = [];

type HomeFilter = "all" | "songs" | "playlists" | "artists";
type ItemFilter = Exclude<HomeFilter, "all">;

const HOME_FILTERS: { id: HomeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "songs", label: "Songs" },
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
];
const FEED_KIND: Record<ItemFilter, string> = { songs: "track", playlists: "playlist", artists: "artist" };
const RECENT_KIND: Record<ItemFilter, string> = { songs: "song", playlists: "playlist", artists: "artist" };

function filterShelf<T extends HomeShelf>(shelf: T, filter: HomeFilter): T {
  if (filter === "all") return shelf;
  return { ...shelf, items: shelf.items.filter((item) => item.kind === FEED_KIND[filter]) };
}

function filterSections(sections: FeedSection[], filter: HomeFilter): FeedSection[] {
  if (filter === "all") return sections;
  return sections.flatMap((section) => {
    const items = section.items.filter((item) => item.kind === FEED_KIND[filter]);
    const shelf = section.shelf ? filterShelf(section.shelf, filter) : undefined;
    const playlists = filter === "playlists" ? section.playlists : undefined;
    const kept = items.length > 0 || (shelf?.items.length ?? 0) > 0 || (playlists?.length ?? 0) > 0;
    return kept ? [{ ...section, items, shelf, playlists }] : [];
  });
}

type LoadStatus = "loading" | "loaded" | "failed";

function recentMenu(item: RecentItem): MenuItem[] {
  switch (item.kind) {
    case "song":
      return trackMenuItems(songOf({ id: item.id, title: item.title, artist: item.subtitle, thumb: item.thumb }));
    case "album":
    case "artist":
    case "playlist":
      return browseMenuItems({ type: item.kind, browseId: item.id, title: item.title, subtitle: item.subtitle, thumb: item.thumb });
  }
}

function featuredMenu(item: FeaturedItem): MenuItem[] {
  return browseMenuItems({
    type: item.target.name === "album" ? "album" : "playlist",
    browseId: item.target.param,
    title: item.title,
    subtitle: item.subtitle ?? "",
    thumb: item.thumb,
  });
}

function PhoneSkeleton() {
  return (
    <div role="status" aria-label="Loading Home" className="space-y-7">
      <span className="block h-[26px] w-40 rounded-[6px] bg-wash" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="block h-14 rounded-[10px] bg-wash" />
        ))}
      </div>
      <span className="block h-[132px] rounded-[12px] bg-wash" />
      <div className="-mx-4 flex gap-3 overflow-hidden px-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="w-[164px] shrink-0">
            <span className="block aspect-square w-full rounded-[10px] bg-wash" />
            <span className="mt-2 block h-[18px] w-4/5 rounded-[6px] bg-wash" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingShelves() {
  return (
    <div role="status" aria-label="Loading Home" className="space-y-8">
      <span className="sr-only">Finding music for your Home.</span>
      {[0, 1].map((section) => (
        <div key={section} aria-hidden="true">
          <div className="mb-4 h-5 w-36 rounded-control bg-wash" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4 overflow-hidden">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="min-w-0">
                <div className="aspect-square max-h-[180px] rounded-[10px] bg-wash" />
                <div className="mt-3 h-3 w-3/4 rounded-control bg-wash" />
                <div className="mt-2 h-2.5 w-1/2 rounded-control bg-wash" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomeView() {
  const region = marketValue();
  const { location } = region;
  const shelves = useHomeCache((state) => (state.market === location && state.language === region.lang ? state.shelves : NO_SHELVES));
  const recent = useRecentItems((state) => state.items);
  const navigate = useNavigation((state) => state.navigate);
  const sectionOrder = useSettings((state) => state.homeSectionOrder);
  const hiddenSections = useSettings((state) => state.hiddenHomeSections);
  const history = useLibrary((state) => state.history);
  const liked = useLibrary((state) => state.liked);
  const fetchedAt = useHomeCache((state) => state.fetchedAt);
  const continuation = useHomeCache((state) => state.market === location && state.language === region.lang ? state.continuation : null);
  const hidden = useHomeEngagement(state => state.hiddenTracks);
  const blocked = useMemo(() => hiddenNow(hidden, Date.now()), [hidden]);
  const phone = usePhone();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const moreRef = useRef<HTMLDivElement>(null);
  const [homeFilter, setHomeFilter] = useState<HomeFilter>("all");
  const [revealPlan] = useState<HomeRevealPlan>(() => ({ intro: claimHomeIntro(), painted: false, mountedAt: performance.now() }));

  useEffect(() => {
    revealPlan.painted = true;
  }, [revealPlan]);

  useEffect(() => {
    let current = true;
    setStatus("loading");
    refreshHome(attempt > 0).then(
      () => {
        if (current) setStatus("loaded");
      },
      () => {
        if (current) setStatus("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, region.location, region.lang]);

  const retry = () => {
    setStatus("loading");
    setAttempt((count) => count + 1);
  };
  const pull = usePullToRefresh({ enabled: phone, busy: status === "loading", onRefresh: retry });
  const pullWillChange = useTransform(pull.distance, (distance) => (distance > 0 ? "transform" : "auto"));

  const tiles = recent
    .filter((item) => item.id !== TEST_SONG_ID)
    .slice(0, phone ? TILE_LIMIT : DESKTOP_TILE_LIMIT);
  const feed = useHomeFeed(shelves);
  const allSections = orderHomeSections(
    feed.filter((section) => section.kind !== "browse"),
    sectionOrder,
    hiddenSections,
  );
  const jumpBackTracks = allSections.flatMap((section) =>
    section.kind === "jump-back-in" ? section.items.flatMap((item) => (item.kind === "track" ? [item.track] : [])) : [],
  );
  const quick = phone ? quickTilesFrom(tiles, jumpBackTracks, TILE_LIMIT) : tiles;
  const quickSongs = new Set(quick.filter(item => item.kind === "song").map(item => item.id));
  const sections = allSections.filter(section => section.kind !== "market")
    .map(section => ({ ...section, items: section.items.filter(item => item.kind !== "track" || !quickSongs.has(item.track.id)) }))
    .filter(section => section.items.length || section.playlists?.length || section.shelf?.items.length).slice(0, 3);
  const featured = featuredFrom(allSections);
  const featuredPlaylistId = featured?.target.name === "ytplaylist" ? featured.target.param : null;
  const shelfSections =
    featuredPlaylistId
      ? sections.map((section) =>
          section.playlists ? { ...section, playlists: section.playlists.filter((playlist) => playlist.id !== featuredPlaylistId) } : section,
        ).filter(section => section.items.length || section.playlists?.length || section.shelf?.items.length)
      : sections;
  const hasContent = quick.length > 0 || sections.length > 0 || featured !== null;

  const initialRemote = useMemo(() => {
    if (hiddenSections.includes("market")) return [];
    const seen = new Set<string>([...blocked].map(id => `track:${id}`));
    for (const item of quick) seen.add(`${item.kind === "song" ? "track" : item.kind}:${item.id.replace(/^VL/, "")}`);
    for (const section of sections) {
      for (const item of section.items) {
        if (item.kind === "track") seen.add(`track:${item.track.id}`);
        if (item.kind === "album") seen.add(`album:${item.album.id}`);
        if (item.kind === "artist") seen.add(`artist:${item.artist.id}`);
        if (item.kind === "playlist") seen.add(`playlist:${item.playlist.id.replace(/^VL/, "")}`);
      }
      for (const playlist of section.playlists ?? []) seen.add(`playlist:${playlist.id.replace(/^VL/, "")}`);
    }
    if (featuredPlaylistId) seen.add(`playlist:${featuredPlaylistId.replace(/^VL/, "")}`);
    return freshHomeShelves(shelves, seen);
  }, [shelves, hiddenSections, quick, sections, featuredPlaylistId, blocked]);
  const seeds = useMemo(() => [...history, ...liked].filter(track => !track.episode && !blocked.has(track.id)), [history, liked, blocked]);
  const stream = useHomeStream(region, `${location}:${region.lang}:${fetchedAt ?? "local"}`, shelves, continuation ?? null, seeds);
  const canDiscover = !hiddenSections.includes("market") && status !== "loading";
  useEffect(() => {
    if (!canDiscover || stream.loading || stream.error || stream.done || !moreRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void stream.loadMore();
    }, { root: document.getElementById("view-scroll"), rootMargin: "2000px 0px" });
    observer.observe(moreRef.current);
    return () => observer.disconnect();
  }, [canDiscover, stream.loading, stream.error, stream.done, stream.loadMore, stream.shelves.length]);

  const phoneLead =
    quick.length > 0 || featured ? (
      <div className="space-y-3">
        {quick.length > 0 && (
          <HomeReveal plan={revealPlan} index={0}>
            <PhoneQuickTiles items={quick} menuFor={(item) => () => recentMenu(item)} />
          </HomeReveal>
        )}
        {featured && (
          <HomeReveal plan={revealPlan} index={1}>
            <PhoneFeatured item={featured} menu={() => featuredMenu(featured)} />
          </HomeReveal>
        )}
      </div>
    ) : null;

  const shownQuick = homeFilter === "all" ? quick : quick.filter((item) => item.kind === RECENT_KIND[homeFilter]);
  const shownSections = filterSections(shelfSections, homeFilter);
  const shownRemote = initialRemote.map((shelf) => filterShelf(shelf, homeFilter));
  const shownStream = stream.shelves.map((shelf) => filterShelf(shelf, homeFilter));
  const filterEmpty =
    homeFilter !== "all" &&
    shownQuick.length === 0 &&
    shownSections.length === 0 &&
    !shownRemote.some((shelf) => shelf.items.length > 0) &&
    !shownStream.some((shelf) => shelf.items.length > 0);

  const revealed = (index: number, key: string, node: ReactNode) =>
    phone ? (
      <HomeReveal key={key} plan={revealPlan} index={index}>
        {node}
      </HomeReveal>
    ) : (
      <Fragment key={key}>{node}</Fragment>
    );

  const content = (
    <>
      {phone ? phoneLead : shownQuick.length > 0 && <QuickTiles items={shownQuick} />}
      {!phone && featured && homeFilter === "all" && <HomeFeature item={featured} />}
      {shownSections.map((section, index) =>
        revealed(2 + index, section.id, <FeedSectionView section={section} />),
      )}
      {shownRemote.map((shelf, index) =>
        revealed(
          2 + shownSections.length + index,
          `home-${index}-${shelf.title}`,
          <DeferredSection><FeedSectionView section={{ id: `home-${index}`, kind: "market", title: shelf.title, layout: "yt-shelf", priority: 0, items: [], shelf }} /></DeferredSection>,
        ),
      )}
      {!hiddenSections.includes("market") && shownStream.map(shelf => {
        const visible = { ...shelf, items: shelf.items.filter(item => item.kind !== "track" || !blocked.has(item.track.id)) };
        return visible.items.length ? revealed(0, shelf.id, <DeferredSection><FeedSectionView section={{ id: shelf.id, kind: "market", title: shelf.title, layout: "yt-shelf", priority: 0, items: [], shelf: visible }} /></DeferredSection>) : null;
      })}
    </>
  );

  const states = (
    <>
      <SkeletonFade show={!hasContent && !initialRemote.length && status === "loading"}>{phone ? <PhoneSkeleton /> : <LoadingShelves />}</SkeletonFade>
      {!hasContent && !initialRemote.length && status === "failed" && (
        <ErrorState
          title="Couldn't load Home"
          message="Check your connection, then try again."
          action={{ label: "Try again", onClick: retry }}
        />
      )}
      {!hasContent && !initialRemote.length && !stream.shelves.length && status === "loaded" && (stream.done || hiddenSections.includes("market")) && (
        <EmptyState
          title="Nothing here yet"
          message="Play a song or search for music to fill Home."
          action={{ label: "Search for songs", onClick: () => navigate({ name: "search" }) }}
        />
      )}
    </>
  );

  return (
    <div className="home-page relative">
      {phone && <PullIndicator distance={pull.distance} spinning={pull.refreshing} />}
      <motion.div className="relative" style={phone ? { y: pull.distance, willChange: pullWillChange } : undefined}>
      {phone && <PageHeader title={greetingFor(new Date())} actions={<PhoneProfileButton />} />}
      {!phone && (
        <div role="group" aria-label="Filter Home" className="flex flex-wrap gap-2 pb-4">
          {HOME_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={homeFilter === item.id}
              onClick={() => setHomeFilter(item.id)}
              className={`h-8 rounded-full px-3.5 text-meta font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                homeFilter === item.id ? "bg-ink-1 text-base" : "bg-wash text-ink-2 hover:text-ink-1"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="home-sections">
        {(hasContent || initialRemote.length > 0 || stream.shelves.length > 0) && content}
        {states}
        {filterEmpty && <p className="py-10 text-center text-meta text-ink-2">Nothing matches this filter yet.</p>}
        {canDiscover && (!stream.done || hasContent || initialRemote.length > 0 || stream.shelves.length > 0) && <div className="home-feed-footer" ref={moreRef}>
          <span role="status" className="sr-only">{!stream.loading && stream.shelves.length ? `${stream.shelves.reduce((sum, shelf) => sum + shelf.items.length, 0)} additional recommendations loaded.` : ""}</span>
          {stream.error ? <div role="alert"><Button variant="ghost" onClick={() => void stream.loadMore()}>Show more music</Button></div> : !stream.done && <div aria-hidden="true" className="home-shelf-skeleton"><span className="home-shelf-skeleton-title bt-skeleton" />{Array.from({ length: 6 }, (_, index) => <span key={index} className="home-shelf-skeleton-card bt-skeleton" />)}</div>}
        </div>}
      </div>
      </motion.div>
    </div>
  );
}
