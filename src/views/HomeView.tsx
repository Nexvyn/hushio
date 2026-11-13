import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FeedSectionView } from "../components/FeedSections";
import { QuickTiles } from "../components/HomeShelves";
import { PageHeader } from "../components/PageHeader";
import { TEST_SONG_ID } from "../lib/audio";
import { refreshHome, type HomeShelf } from "../lib/home";
import { orderHomeSections } from "../lib/homeSections";
import { marketValue } from "../lib/market";
import { useHomeFeed } from "../lib/useHomeFeed";
import { useHomeCache } from "../stores/homeCache";
import { useNavigation } from "../stores/navigation";
import { useRecentItems } from "../stores/recents";
import { useSettings } from "../stores/settings";

const TILE_LIMIT = 6;
const NO_SHELVES: HomeShelf[] = [];

type LoadStatus = "loading" | "loaded" | "failed";

function LoadingShelves() {
  return (
    <div role="status" aria-label="Loading Home" className="space-y-10">
      {[0, 1].map((index) => (
        <div key={index} className="h-[220px] rounded-[11px] bg-wash" />
      ))}
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

  const tiles = recent.filter((item) => item.kind === "song" && item.id !== TEST_SONG_ID).slice(0, TILE_LIMIT);
  const feed = useHomeFeed(shelves);
  const sections = orderHomeSections(
    feed.filter((section) => section.kind !== "browse"),
    sectionOrder,
    hiddenSections,
  );
  const hasContent = tiles.length > 0 || sections.length > 0;

  return (
    <div className="relative">
      <PageHeader title="Home" />
      <div className="mt-4 space-y-7">
        {tiles.length > 0 && <QuickTiles items={tiles} />}
        {sections.map((section) => (
          <FeedSectionView key={section.id} section={section} />
        ))}
        {!hasContent && status === "loading" && <LoadingShelves />}
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
      </div>
    </div>
  );
}
