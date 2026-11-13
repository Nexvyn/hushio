import { useEffect } from "react";
import {
  FavouriteIcon,
  PlayIcon,
  PlayListAddIcon,
  ShuffleIcon,
} from "@hugeicons/core-free-icons";
import { ActionMenu } from "../components/ActionMenu";
import { AboutText } from "../components/AboutText";
import { HeroControls } from "../components/BrowseHero";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { ErrorState } from "../components/ErrorState";
import { HomeShelfView } from "../components/HomeShelves";
import { HeroIcon } from "../components/HeroIcon";
import { PHONE_ICON, PHONE_PLAY, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneArt } from "../components/phone/PhoneArt";
import { PhoneSectionHeader, PhoneShelfArt, PhoneShelfCard, PhoneShelfRow } from "../components/phone/PhoneShelf";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import type { MenuItem } from "../stores/ui";
import { TrackRow } from "../components/TrackRow";
import { getArtistPage } from "../lib/browse";
import type { ArtistPage } from "../lib/browseParse";
import { addedMessage, queueAll } from "../lib/browseActions";
import { thumbArtwork } from "../lib/artwork";
import { trackMenuItems } from "../lib/trackActions";
import { heroCover, joinMeta, listenersChip, subscriberChip } from "../lib/browseText";
import type { HomeItem } from "../lib/home";
import { usePhone } from "../lib/usePhone";
import { useBrowseLoad } from "../lib/useBrowseLoad";
import { useBrowsePlayback } from "../lib/useBrowsePlayback";
import { rememberArtist } from "../stores/artistMeta";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { playFromRow } from "../stores/player";
import { useUI } from "../stores/ui";

const MAX_ARTIST_SONGS = 20;
const PHOTO_ART = 176;
const SHELF_ART = 148;

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

function PhoneShelfItem({ item }: { item: HomeItem }) {
  const navigate = useNavigation((state) => state.navigate);
  switch (item.kind) {
    case "track":
      return (
        <PhoneShelfCard
          art={<PhoneArt src={thumbArtwork(item.track.thumb, SHELF_ART) || null} radius="rounded-[10px]" />}
          title={item.track.title}
          subtitle={item.track.artist}
          onActivate={() => playFromRow([item.track], 0)}
        />
      );
    case "album":
      return (
        <PhoneShelfCard
          art={<PhoneShelfArt src={item.thumb} variant="large" />}
          variant="large"
          title={item.title}
          subtitle={item.artist}
          onActivate={() => navigate({ name: "album", param: item.id })}
        />
      );
    case "artist":
      return (
        <PhoneShelfCard
          art={<PhoneShelfArt src={item.thumb} variant="round" round />}
          variant="round"
          round
          title={item.name}
          onActivate={() => navigate({ name: "artist", param: item.id })}
        />
      );
    case "playlist":
      return (
        <PhoneShelfCard
          art={<PhoneArt src={thumbArtwork(item.thumb, SHELF_ART) || null} radius="rounded-[10px]" />}
          title={item.title}
          subtitle={item.subtitle}
          onActivate={() => navigate({ name: "ytplaylist", param: item.id })}
        />
      );
  }
}

function ArtistContent({ page }: { page: ArtistPage }) {
  const { artist } = page;
  const top = page.songs.slice(0, MAX_ARTIST_SONGS);
  const { current, playing, playAt, shuffle } = useBrowsePlayback(top, artist.id);
  const followed = useLibrary((state) => state.followedArtists.some((item) => item.id === artist.id));
  const followArtist = useLibrary((state) => state.followArtist);
  const unfollowArtist = useLibrary((state) => state.unfollowArtist);
  const phone = usePhone();
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

  if (phone) {
    const photo = thumbArtwork(artist.thumb, PHOTO_ART) || null;
    return (
      <div className="pb-14">
        <header className="flex min-w-0 flex-col items-center text-center">
          <PhoneArt src={photo} round className="mt-2 block size-36 shrink-0" />
          <h1 className="mt-4 line-clamp-2 max-w-full break-words text-[22px] font-semibold leading-[28px] text-ink-1">{artist.name}</h1>
          <div className="mt-1 text-[13px] leading-[18px] tabular-nums text-ink-2">{joinMeta([subscribers, listeners])}</div>
          <div className="mt-4 flex w-full min-w-0 items-center gap-3">
            <button type="button" onClick={() => playAt(0)} disabled={top.length === 0} className={PHONE_PLAY}>
              <HeroIcon icon={PlayIcon} />
              Play
            </button>
            <button type="button" aria-label="Shuffle" title="Shuffle" onClick={shuffle} disabled={top.length === 0} className={PHONE_SHUFFLE}>
              <HeroIcon icon={ShuffleIcon} />
              Shuffle
            </button>
            <ActionMenu items={menu} label="More options" triggerClass={PHONE_ICON} phoneIcon />
          </div>
        </header>

        {page.description && (
          <div className="mt-6">
            <AboutText heading="About the artist" text={page.description} />
          </div>
        )}

        {top.length > 0 && (
          <section className="mt-7">
            <PhoneSectionHeader title="Popular" />
            <ol>
              {top.map((song, index) => (
                <PhoneSongRow
                  key={`${song.id}-${index}`}
                  index={index}
                  song={song}
                  current={song.id === current}
                  playing={playing}
                  menu={() => trackMenuItems(song)}
                  onPlay={() => playAt(index)}
                />
              ))}
            </ol>
          </section>
        )}

        {page.shelves.map((shelf, index) => (
          <section key={`${shelf.title}-${index}`} className="mt-7">
            <PhoneSectionHeader title={shelf.title} />
            <PhoneShelfRow>
              {shelf.items.map((item, itemIndex) => (
                <PhoneShelfItem key={`${item.kind}-${itemIndex}`} item={item} />
              ))}
            </PhoneShelfRow>
          </section>
        ))}
      </div>
    );
  }

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
