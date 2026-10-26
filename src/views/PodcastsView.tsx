import { useEffect, useState } from "react";
import { Mic01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../components/Icon";
import { PodcastCard } from "../components/PodcastCard";
import { freshPodcasts, loadPodcasts } from "../lib/podcasts";
import type { PodcastShelf } from "../lib/podcastParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const SKELETON_SHELVES = 2;
const SKELETON_CARDS = 5;

function ShelfSkeleton() {
  return (
    <div aria-hidden="true" className="mt-10 motion-safe:animate-pulse">
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
    <div className="pt-2">
      <h1 className="flex items-center gap-2 text-[34px] font-extrabold tracking-[-0.03em] text-ink-1">
        <Icon icon={Mic01Icon} />
        Podcasts
      </h1>
      <p className="mb-7 mt-1 text-[13px] text-ink-2">Popular in your region on YouTube Music</p>

      {shelves === null ? (
        Array.from({ length: SKELETON_SHELVES }, (_, index) => <ShelfSkeleton key={index} />)
      ) : shelves.length === 0 ? (
        <p className="text-[14px] text-ink-2">Podcasts couldn't be loaded right now. Try again in a moment.</p>
      ) : (
        shelves.map((shelf, index) => (
          <section key={`${index}-${shelf.title}`} className="animate-slide-up mt-10 first:mt-0">
            <h2 className="mb-3 text-[19px] font-semibold text-ink-1">{shelf.title}</h2>
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
