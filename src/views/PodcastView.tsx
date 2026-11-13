import { useEffect, useState } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { EqBars } from "../components/EqBars";
import { ErrorState } from "../components/ErrorState";
import { Icon } from "../components/Icon";
import { getPodcast } from "../lib/podcasts";
import type { PodcastEpisode, PodcastPage } from "../lib/podcastParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base";
const cover = "outline outline-1 -outline-offset-1 outline-black/10 [[data-theme=dark]_&]:outline-white/10";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; page: PodcastPage };

function HeroSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6 bt-skeleton sm:flex-row">
      <div className="h-[176px] w-[176px] shrink-0 rounded-[16px] bg-wash" />
      <div className="flex-1 space-y-3 pt-2">
        <div className="h-3 w-24 rounded bg-wash" />
        <div className="h-9 w-3/4 rounded bg-wash" />
        <div className="h-4 w-1/3 rounded bg-wash" />
      </div>
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1 bt-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 p-3">
          <span className="h-24 w-24 shrink-0 rounded-[8px] bg-wash" />
          <span className="flex-1 space-y-2">
            <span className="block h-4 w-2/3 rounded bg-wash" />
            <span className="block h-3 w-1/3 rounded bg-wash" />
          </span>
        </div>
      ))}
    </div>
  );
}

function EpisodeRow({ episode, current, playing, onPlay }: { episode: PodcastEpisode; current: boolean; playing: boolean; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`flex w-full items-center gap-4 rounded-[12px] p-3 text-left hover:bg-wash motion-safe:transition-colors ${current ? "bg-wash" : ""} ${focusRing}`}
    >
      <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[8px]">
        {episode.thumb ? (
          <img src={episode.thumb} alt="" loading="lazy" className={`h-full w-full object-cover ${cover}`} />
        ) : (
          <span aria-hidden="true" className="block h-full w-full bg-wash" />
        )}
        {current && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
            <EqBars playing={playing} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[15px] font-semibold leading-snug text-ink-1">{episode.title}</span>
        {episode.published && <span className="mt-1 block text-[12.5px] text-ink-2">{episode.published}</span>}
        {episode.description && (
          <span className="mt-1.5 line-clamp-2 block text-[13px] text-ink-2">{episode.description}</span>
        )}
      </span>
    </button>
  );
}

export function PodcastView() {
  const param = useNavigation((state) => state.view.param) ?? "";
  const [nonce, setNonce] = useState(0);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const playing = usePlayer((state) => state.playing);
  const current = usePlayer((state) => state.queue[state.index]?.id);
  const playQueue = usePlayer((state) => state.playQueue);

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });
    void getPodcast(param).then(
      (page) => {
        if (live) setLoad({ status: "ready", page });
      },
      () => {
        if (live) setLoad({ status: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [param, nonce]);

  if (load.status === "error") {
    return (
      <div className="pt-2">
        <ErrorState
          title="This podcast didn't load"
          message="Give it another try."
          action={{ label: "Try again", onClick: () => setNonce((value) => value + 1) }}
        />
      </div>
    );
  }

  if (load.status === "loading") {
    return (
      <div className="space-y-6 pb-12 pt-2">
        <HeroSkeleton />
        <ListSkeleton rows={4} />
      </div>
    );
  }

  const { page } = load;
  const [latest] = page.episodes;

  return (
    <div className="space-y-7 pb-12">
      <PageHeader
        ambient
        title={page.title}
        artwork={page.thumb}
        meta={
          <>
            {page.author && <span className="block text-body text-ink-2">{page.author}</span>}
            {page.description && <span className="mt-2 line-clamp-3 block max-w-[672px] text-meta text-ink-2">{page.description}</span>}
          </>
        }
        actions={
          latest && (
            <button
              type="button"
              onClick={() => playQueue([latest], 0)}
              className={`inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-semibold text-on-primary hover:opacity-90 motion-safe:transition-opacity ${focusRing}`}
            >
              <Icon icon={PlayIcon} />
              Play latest episode
            </button>
          )
        }
      />

      <section>
        <SectionHeader title="Episodes" />
        {page.episodes.length > 0 ? (
          <div className="flex flex-col gap-1">
            {page.episodes.map((episode) => (
              <EpisodeRow
                key={episode.id}
                episode={episode}
                current={episode.id === current}
                playing={playing}
                onPlay={() => playQueue([episode], 0)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-2">No episodes to play yet.</p>
        )}
      </section>
    </div>
  );
}
