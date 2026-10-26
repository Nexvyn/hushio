import { useEffect } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ChartBarLineIcon,
  FavouriteIcon,
  PlayListAddIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { AboutText } from "../components/AboutText";
import { BrowseHero, HeroControls } from "../components/BrowseHero";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { ErrorState } from "../components/ErrorState";
import { HomeShelfView } from "../components/HomeShelves";
import { Icon } from "../components/Icon";
import type { MenuItem } from "../components/ActionMenu";
import { TrackRow } from "../components/TrackRow";
import { getArtistPage } from "../lib/browse";
import type { ArtistPage } from "../lib/browseParse";
import { addedMessage, queueAll, songMenu } from "../lib/browseActions";
import { artistTitleSize, heroCover, listenersChip, subscriberChip } from "../lib/browseText";
import { useBrowseLoad } from "../lib/useBrowseLoad";
import { useBrowsePlayback } from "../lib/useBrowsePlayback";
import { rememberArtist } from "../stores/artistMeta";
import { useNavigation } from "../stores/navigation";

const MAX_ARTIST_SONGS = 20;

export function ArtistView() {
  const artistId = useNavigation((state) => state.view.param) ?? "";
  const { state, retry } = useBrowseLoad(artistId, getArtistPage);

  if (state.status === "loading") return <BrowseSkeleton rows={6} />;
  if (state.status === "error") {
    return (
      <div className="pt-10">
        <ErrorState
          title="Couldn't load this artist"
          message="This is usually a connection hiccup. Give it another try."
          action={{ label: "Try again", onClick: retry }}
        />
      </div>
    );
  }
  return <ArtistContent page={state.data} />;
}

function Chip({ icon, label }: { icon: IconSvgElement; label: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 text-[12px] text-white/85">
      <Icon icon={icon} />
      {label}
    </span>
  );
}

function ArtistContent({ page }: { page: ArtistPage }) {
  const { artist } = page;
  const top = page.songs.slice(0, MAX_ARTIST_SONGS);
  const { current, playing, playAt, shuffle } = useBrowsePlayback(top, artist.id);
  const subscribers = subscriberChip(page.subscriberCount);
  const listeners = listenersChip(page.monthlyListeners);

  useEffect(() => {
    rememberArtist(artist);
  }, [artist]);

  const menu: MenuItem[] = [
    {
      label: "Add all to queue",
      icon: PlayListAddIcon,
      disabled: top.length === 0,
      onSelect: () => queueAll(top, addedMessage(top.length)),
    },
    { label: "Follow artist", icon: FavouriteIcon, disabled: true, separatorBefore: true },
  ];

  return (
    <div>
      <BrowseHero cover={heroCover(artist.thumb)} topPadding="pt-[300px]">
        <h1 className={`${artistTitleSize(artist.name)} font-extrabold leading-[1.1] tracking-[-0.03em]`}>
          {artist.name}
        </h1>
        {(subscribers || listeners) && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {subscribers && <Chip icon={UserIcon} label={subscribers} />}
            {listeners && <Chip icon={ChartBarLineIcon} label={listeners} />}
          </div>
        )}
        <HeroControls
          onShuffle={shuffle}
          onPlay={() => playAt(0)}
          shuffleDisabled={top.length === 0}
          playDisabled={top.length === 0}
          menu={menu}
        />
      </BrowseHero>

      <div className="px-8 pb-12">
        {page.description && (
          <div className="mt-7">
            <AboutText heading="About the artist" text={page.description} />
          </div>
        )}

        {top.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-3 text-[21px] font-semibold text-ink-1">Top songs</h2>
            <ol>
              {top.map((song, index) => (
                <TrackRow
                  key={`${song.id}-${index}`}
                  index={index}
                  song={song}
                  current={song.id === current}
                  playing={playing}
                  artwork
                  dividerInset="after:left-[80px]"
                  menu={songMenu(song)}
                  onPlay={() => playAt(index)}
                />
              ))}
            </ol>
          </section>
        )}

        {page.shelves.map((shelf, index) => (
          <div key={`${shelf.title}-${index}`} className="mt-10">
            <HomeShelfView shelf={shelf} />
          </div>
        ))}
      </div>
    </div>
  );
}
