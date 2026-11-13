import { useEffect } from "react";
import {
  FavouriteIcon,
  PlayListAddIcon,
} from "@hugeicons/core-free-icons";
import { AboutText } from "../components/AboutText";
import { HeroControls } from "../components/BrowseHero";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { ErrorState } from "../components/ErrorState";
import { HomeShelfView } from "../components/HomeShelves";
import type { MenuItem } from "../stores/ui";
import { TrackRow } from "../components/TrackRow";
import { getArtistPage } from "../lib/browse";
import type { ArtistPage } from "../lib/browseParse";
import { addedMessage, queueAll} from "../lib/browseActions";
import { trackMenuItems } from "../lib/trackActions";
import { heroCover, listenersChip, subscriberChip } from "../lib/browseText";
import { useBrowseLoad } from "../lib/useBrowseLoad";
import { useBrowsePlayback } from "../lib/useBrowsePlayback";
import { rememberArtist } from "../stores/artistMeta";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

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

function ArtistContent({ page }: { page: ArtistPage }) {
  const { artist } = page;
  const top = page.songs.slice(0, MAX_ARTIST_SONGS);
  const { current, playing, playAt, shuffle } = useBrowsePlayback(top, artist.id);
  const followed = useLibrary((state) => state.followedArtists.some((item) => item.id === artist.id));
  const followArtist = useLibrary((state) => state.followArtist);
  const unfollowArtist = useLibrary((state) => state.unfollowArtist);
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
    {
      label: followed ? "Unfollow artist" : "Follow artist",
      icon: FavouriteIcon,
      separatorBefore: true,
      onSelect: () => {
        if (followed) {
          unfollowArtist(artist.id);
          useUI.getState().toast("Removed from your library", "info");
          return;
        }
        followArtist({ id: artist.id, name: artist.name, thumb: artist.thumb ?? undefined });
        useUI.getState().toast("Added to your library", "info");
      },
    },
  ];

  return (
    <>
      <PageHeader
        ambient
        title={artist.name}
        artwork={heroCover(artist.thumb)}
        meta={
          <>
            {subscribers && <span>{subscribers}</span>}
            {subscribers && listeners && <span aria-hidden="true" className="mx-1.5">·</span>}
            {listeners && <span>{listeners}</span>}
          </>
        }
        actions={
          <HeroControls
            onShuffle={shuffle}
            onPlay={() => playAt(0)}
            shuffleDisabled={top.length === 0}
            playDisabled={top.length === 0}
            menu={menu}
          />
        }
      />

      <div className="pb-12">
        {page.description && (
          <div className="mt-7">
            <AboutText heading="About the artist" text={page.description} />
          </div>
        )}

        {top.length > 0 && (
          <section className="mt-7">
            <SectionHeader title="Top songs" />
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
                  menu={() => trackMenuItems(song)}
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
    </>
  );
}
