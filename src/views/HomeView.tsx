import { useEffect, useState } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FeedSectionView } from "../components/FeedSections";
import { QuickTiles } from "../components/HomeShelves";
import { Icon } from "../components/Icon";
import { Pill } from "../components/Pill";
import { TEST_SONG_ID, TEST_SONG_TITLE } from "../lib/audio";
import { HOME_MOODS, refreshHome, type HomeShelf } from "../lib/home";
import { marketValue } from "../lib/market";
import { useHomeFeed } from "../lib/useHomeFeed";
import { useHomeCache } from "../stores/homeCache";
import { useNavigation } from "../stores/navigation";
import { playFromRow } from "../stores/player";
import { useRecentItems } from "../stores/recents";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const TEST_TRACK: Track = {
  id: TEST_SONG_ID,
  title: TEST_SONG_TITLE,
  artist: "Test",
  thumb: `https://i.ytimg.com/vi/${TEST_SONG_ID}/hqdefault.jpg`,
};

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
  const setSearchQuery = useUI((state) => state.setSearchQuery);
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

  const tiles = recent.filter((item) => item.kind === "song").slice(0, TILE_LIMIT);
  const feed = useHomeFeed(shelves);
  const sections = feed.filter((section) => section.kind !== "browse");
  const hasContent = tiles.length > 0 || sections.length > 0;

  return (
    <div className="relative">
      <h1 className="sr-only">Home</h1>
      <div className="space-y-10">
        {import.meta.env.DEV && (
          <div className="flex items-center gap-3">
            <Button variant="primary" className="gap-2" onClick={() => playFromRow([TEST_TRACK], 0)}>
              <Icon icon={PlayIcon} />
              Play test song
            </Button>
          </div>
        )}
        {tiles.length > 0 && <QuickTiles items={tiles} />}
        <div className="flex flex-wrap gap-2">
          {HOME_MOODS.map((mood) => (
            <Pill
              key={mood}
              className="min-h-10"
              onClick={() => {
                setSearchQuery(mood);
                navigate({ name: "search" });
              }}
            >
              {mood}
            </Pill>
          ))}
        </div>
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
