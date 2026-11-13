import { useEffect, useState, type ReactNode } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FeedSectionView, featuredFrom } from "../components/FeedSections";
import { QuickTiles } from "../components/HomeShelves";
import { PageHeader } from "../components/PageHeader";
import { PhoneFeatured } from "../components/phone/PhoneFeatured";
import { TEST_SONG_ID } from "../lib/audio";
import { PhoneProfileButton } from "../components/phone/PhoneProfileButton";
import { PhoneQuickTiles } from "../components/phone/PhoneShelf";
import { greetingFor } from "../lib/greeting";
import { refreshHome, type HomeShelf } from "../lib/home";
import { orderHomeSections } from "../lib/homeSections";
import { marketValue } from "../lib/market";
import { quickTilesFrom, sameSongRow } from "../lib/quickTiles";
import { usePhone } from "../lib/usePhone";
import { useHomeFeed } from "../lib/useHomeFeed";
import { useHomeCache } from "../stores/homeCache";
import { useNavigation } from "../stores/navigation";
import { useRecentItems } from "../stores/recents";
import { useSettings } from "../stores/settings";

const TILE_LIMIT = 6;
const NO_SHELVES: HomeShelf[] = [];

type LoadStatus = "loading" | "loaded" | "failed";

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
    <div role="status" aria-label="Loading Home" className="space-y-10">
      {[0, 1].map((index) => (
        <div key={index} className="h-[220px] rounded-[11px] bg-wash" />
      ))}
    </div>
  );
}

function FadeIn({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={`motion-safe:transition-opacity motion-safe:duration-reading ${shown ? "opacity-100" : "opacity-0"}`}>
      {children}
    </div>
  );
}

export function HomeView() {
  const { location } = marketValue();
  const shelves = useHomeCache((state) => (state.market === location ? state.shelves : NO_SHELVES));
  const recent = useRecentItems((state) => state.items);
  const navigate = useNavigation((state) => state.navigate);
  const sectionOrder = useSettings((state) => state.homeSectionOrder);
  const hiddenSections = useSettings((state) => state.hiddenHomeSections);
  const phone = usePhone();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    let current = true;
    refreshHome().then(
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
  }, [attempt]);

  const retry = () => {
    setStatus("loading");
    setAttempt((count) => count + 1);
  };

  const tiles = recent
    .filter((item) => (phone || item.kind === "song") && item.id !== TEST_SONG_ID)
    .slice(0, TILE_LIMIT);
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
  const repeatsJumpBack = phone && sameSongRow(quick, jumpBackTracks);
  const sections = repeatsJumpBack ? allSections.filter((section) => section.kind !== "jump-back-in") : allSections;
  const featured = phone ? featuredFrom(sections) : null;
  const hasContent = quick.length > 0 || sections.length > 0;

  const phoneLead =
    quick.length > 0 || featured ? (
      <div className="space-y-3">
        {quick.length > 0 && <PhoneQuickTiles items={quick} />}
        {featured && <PhoneFeatured item={featured} />}
      </div>
    ) : null;

  const content = (
    <>
      {phone ? phoneLead : quick.length > 0 && <QuickTiles items={quick} />}
      {sections.map((section) => (
        <FeedSectionView key={section.id} section={section} />
      ))}
    </>
  );

  const states = (
    <>
      {!hasContent && status === "loading" && (phone ? <PhoneSkeleton /> : <LoadingShelves />)}
      {!hasContent && status === "failed" && (
        <ErrorState
          title="Couldn't load Home"
          message="Check your connection, then try again."
          action={{ label: "Try again", onClick: retry }}
        />
      )}
      {!hasContent && status === "loaded" && (
        <EmptyState
          title="Nothing here yet"
          message="Play a song or search for music to fill Home."
          action={{ label: "Search for songs", onClick: () => navigate({ name: "search" }) }}
        />
      )}
    </>
  );

  return (
    <div className="relative">
      <PageHeader title={phone ? greetingFor(new Date()) : "Home"} actions={phone ? <PhoneProfileButton /> : undefined} />
      <div className={phone ? "mt-3 space-y-7" : "mt-4 space-y-7"}>
        {hasContent && (phone ? <FadeIn><div className="space-y-7">{content}</div></FadeIn> : content)}
        {states}
      </div>
    </div>
  );
}
