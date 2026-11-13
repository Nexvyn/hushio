import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { PodcastCard } from "../components/PodcastCard";
import { freshPodcasts, loadPodcasts } from "../lib/podcasts";
import type { PodcastShelf } from "../lib/podcastParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const SKELETON_SHELVES = 2;
const SKELETON_CARDS = 5;

function ShelfSkeleton() {
  return (
    <div aria-hidden="true" className="mt-10 bt-skeleton">
      <div className="mb-3 h-[22px] w-48 rounded bg-wash" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <div key={index} className="w-[184px] shrink-0 p-2">
            <div className="aspect-square rounded-[12px] bg-wash" />
            <div className="mt-2 h-3 w-4/5 rounded bg-wash" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PodcastsView() {
  const navigate = useNavigation((state) => state.navigate);
  const playQueue = usePlayer((state) => state.playQueue);
  const [shelves, setShelves] = useState<PodcastShelf[] | null>(() => freshPodcasts());

  useEffect(() => {
    let live = true;
    void loadPodcasts().then((next) => {
      if (live) setShelves(next);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div>
      <PageHeader title="Podcasts" meta="Popular in your region" />

      {shelves === null ? (
        Array.from({ length: SKELETON_SHELVES }, (_, index) => <ShelfSkeleton key={index} />)
      ) : shelves.length === 0 ? (
        <p className="text-[14px] text-ink-2">Podcasts couldn't be loaded right now. Try again in a moment.</p>
      ) : (
        shelves.map((shelf, index) => (
          <section key={`${index}-${shelf.title}`} className="animate-slide-up mt-7 first:mt-0">
            <SectionHeader title={shelf.title} />
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
              {shelf.shows.map((show) => (
                <PodcastCard
                  key={show.id}
                  title={show.title}
                  subtitle={show.author ?? "Podcast"}
                  thumb={show.thumb}
                  onActivate={() => navigate({ name: "podcast", param: show.id })}
                />
              ))}
              {shelf.episodes.map((episode) => (
                <PodcastCard
                  key={episode.id}
                  title={episode.title}
                  subtitle={episode.artist}
                  thumb={episode.thumb}
                  playable
                  onActivate={() => playQueue([episode], 0)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
