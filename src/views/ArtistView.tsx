import { PlayRound } from "../components/PlayRound";
import { useEffect, useMemo, useState } from "react";
import { CaretDown, CaretUp, Heart, ListPlus, Shuffle } from "@phosphor-icons/react";
import { ActionMenu } from "../components/ActionMenu";
import { AboutText } from "../components/AboutText";
import { CollectionActions } from "../components/TrackListControls";
import { SectionHeader } from "../components/SectionHeader";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { SkeletonSwap } from "../components/SkeletonSwap";
import { useImageReveal } from "../components/useImageReveal";
import { ErrorState } from "../components/ErrorState";
import { focusRing, HomeShelfView, shelfMenu } from "../components/HomeShelves";
import { HeroIcon } from "../components/HeroIcon";
import { Icon } from "../components/Icon";
import { PhoneIcon } from "../components/phone/PhoneIcon";
import { PhoneBackRow } from "../components/phone/PhoneHeader";
import { goBackOrTabRoot } from "../components/PageHeader";
import { PHONE_ICON, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneArt } from "../components/phone/PhoneArt";
import { PhoneSectionHeader, PhoneShelfArt, PhoneShelfCard, PhoneShelfRow } from "../components/phone/PhoneShelf";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { RowThumb } from "../components/RowThumb";
import type { MenuItem } from "../stores/ui";
import { TrackRow } from "../components/TrackRow";
import { getArtistPage } from "../lib/browse";
import type { ArtistPage } from "../lib/browseParse";
import { addedMessage, queueAll } from "../lib/browseActions";
import { toSong } from "../lib/collectionActions";
import { thumbArtwork } from "../lib/artwork";
import { isByArtist } from "../lib/artistMatch";
import { trackMenuItems } from "../lib/trackActions";
import { heroCover, joinMeta, listenersChip, subscriberChip } from "../lib/browseText";
import { isReleaseShelf } from "../lib/discography";
import type { HomeItem } from "../lib/home";
import { plural } from "../lib/plural";
import { usePhone } from "../lib/usePhone";
import { useBrowseLoad } from "../lib/useBrowseLoad";
import { useBrowsePlayback } from "../lib/useBrowsePlayback";
import { rememberArtist } from "../stores/artistMeta";
import { type LibraryTrack, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { playFromRow, usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const MAX_ARTIST_SONGS = 20;
const PHOTO_ART = 176;
const SHELF_ART = 148;

function BannerImage({ src }: { src: string }) {
  const reveal = useImageReveal(src);
  return (
    <img
      loading="lazy"
      decoding="async"
      src={src}
      alt=""
      onLoad={reveal.onLoad}
      className={`h-full w-full object-cover object-[center_25%] ${reveal.className}`}
    />
  );
}

export function ArtistView() {
  const artistId = useNavigation((state) => state.view.param) ?? "";
  const { state, retry } = useBrowseLoad(artistId, getArtistPage);

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
  return (
    <SkeletonSwap loading={state.status === "loading"} skeleton={<BrowseSkeleton rows={6} />}>
      {state.status === "loading" ? null : (
        <div className="animate-fade-in">
          <ArtistContent page={state.data} />
        </div>
      )}
    </SkeletonSwap>
  );
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
          menu={() => shelfMenu(item)}
          onActivate={() => playFromRow([item.track], 0)}
        />
      );
    case "album":
      return (
        <PhoneShelfCard
          art={<PhoneShelfArt src={item.thumb} variant="large" layoutId={`cover:album:${item.id}`} />}
          variant="large"
          title={item.title}
          subtitle={item.artist}
          menu={() => shelfMenu(item)}
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
          menu={() => shelfMenu(item)}
          onActivate={() => navigate({ name: "artist", param: item.id })}
        />
      );
    case "playlist":
      return (
        <PhoneShelfCard
          art={<PhoneArt src={thumbArtwork(item.thumb, SHELF_ART) || null} radius="rounded-[10px]" />}
          title={item.title}
          subtitle={item.subtitle}
          menu={() => shelfMenu(item)}
          onActivate={() => navigate({ name: "ytplaylist", param: item.id })}
        />
      );
  }
}

function LikedByArtist({ artist, tracks, phone }: { artist: ArtistPage["artist"]; tracks: LibraryTrack[]; phone: boolean }) {
  const [open, setOpen] = useState(false);
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);
  if (tracks.length === 0) return null;
  const source = `artist:${artist.id}`;
  const chevron = open ? CaretUp : CaretDown;
  return (
    <section className="mt-6">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full min-w-0 items-center gap-3 rounded-[10px] text-left motion-safe:transition-colors hover:bg-hover ${focusRing}`}
      >
        <RowThumb src={artist.thumb ?? tracks[0].thumb} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-ink-1">You've liked {plural(tracks.length, "song", "songs")}</span>
          <span className="block truncate text-meta text-ink-2">By {artist.name}</span>
        </span>
        {phone ? <PhoneIcon icon={chevron} /> : <Icon icon={chevron} />}
      </button>
      {open && (
        <ol className="mt-3">
          {tracks.map((track, index) => {
            const song = toSong(track);
            const onPlay = () => playFromRow(tracks, index, source);
            return phone ? (
              <PhoneSongRow
                key={`${track.id}-${index}`}
                index={index}
                song={song}
                current={track.id === currentId}
                playing={playing}
                menu={() => trackMenuItems(song)}
                onPlay={onPlay}
              />
            ) : (
              <TrackRow
                key={`${track.id}-${index}`}
                index={index}
                song={song}
                current={track.id === currentId}
                playing={playing}
                menu={() => trackMenuItems(song)}
                onPlay={onPlay}
                artwork
                showAlbum
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ArtistContent({ page }: { page: ArtistPage }) {
  const { artist } = page;
  const top = page.songs.slice(0, MAX_ARTIST_SONGS);
  const { current, playing, playAt, shuffle } = useBrowsePlayback(top, artist.id);
  const followed = useLibrary((state) => state.followedArtists.some((item) => item.id === artist.id));
  const followArtist = useLibrary((state) => state.followArtist);
  const unfollowArtist = useLibrary((state) => state.unfollowArtist);
  const liked = useLibrary((state) => state.liked);
  const likedByArtist = useMemo(() => liked.filter((track) => isByArtist(track, artist)), [liked, artist]);
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const openDiscography = () => navigate({ name: "discography", param: artist.id });
  const subscribers = subscriberChip(page.subscriberCount);
  const listeners = listenersChip(page.monthlyListeners);

  useEffect(() => {
    rememberArtist(artist);
  }, [artist]);

  const menu: MenuItem[] = [
    {
      label: "Add all to queue",
      icon: ListPlus,
      disabled: top.length === 0,
      onSelect: () => queueAll(top, addedMessage(top.length)),
    },
    {
      label: followed ? "Unfollow artist" : "Follow artist",
      icon: Heart,
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
          <PhoneBackRow onBack={goBackOrTabRoot} />
          <PhoneArt src={photo} round className="mt-2 block size-36 shrink-0" />
          <h1 className="mt-4 line-clamp-2 max-w-full break-words text-phone-page-title text-ink-1">{artist.name}</h1>
          <div className="mt-1 text-phone-meta tabular-nums text-ink-2">{joinMeta([subscribers, listeners])}</div>
          <div className="mt-4 flex w-full min-w-0 items-center gap-3">
            <PlayRound phone onClick={() => playAt(0)} disabled={top.length === 0} />
            <button type="button" aria-label="Shuffle" title="Shuffle" onClick={shuffle} disabled={top.length === 0} className={PHONE_SHUFFLE}>
              <HeroIcon icon={Shuffle} />
            </button>
            <ActionMenu items={menu} label="More options" triggerClass={PHONE_ICON} phoneIcon />
          </div>
        </header>

        <LikedByArtist artist={artist} tracks={likedByArtist} phone />

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
            {isReleaseShelf(shelf.title) ? (
              <div className="flex items-baseline justify-between gap-3">
                <PhoneSectionHeader title={shelf.title} />
                <button type="button" onClick={openDiscography} className="shrink-0 text-meta font-medium text-ink-1 hover:underline">
                  See discography
                </button>
              </div>
            ) : (
              <PhoneSectionHeader title={shelf.title} />
            )}
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

  const banner = heroCover(artist.thumb);
  return (
    <>
      <header className="app-page-header">
        <div className="relative h-[300px] w-full overflow-hidden rounded-art bg-wash">
          {banner && <BannerImage src={banner} />}
        </div>
        <h1 className="mt-6 line-clamp-2 break-words text-[clamp(48px,6vw,72px)] font-bold leading-[1.02] tracking-[-0.035em] text-ink-1">
          {artist.name}
        </h1>
        {(listeners || subscribers) && (
          <p className="mt-3 text-body tabular-nums text-ink-2">
            {subscribers && <span>{subscribers}</span>}
            {subscribers && listeners && <span aria-hidden="true" className="mx-1.5">·</span>}
            {listeners && <span>{listeners}</span>}
          </p>
        )}
        <div className="mt-7">
          <CollectionActions
            playLabel="Play"
            disabled={top.length === 0}
            onPlay={() => playAt(0)}
            onShuffle={shuffle}
            menu={menu}
          />
        </div>
      </header>

      <div className="pb-12">
        <LikedByArtist artist={artist} tracks={likedByArtist} phone={false} />

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
                  menu={() => trackMenuItems(song)}
                  onPlay={() => playAt(index)}
                />
              ))}
            </ol>
          </section>
        )}

        {page.shelves.map((shelf, index) => (
          <div key={`${shelf.title}-${index}`} className="mt-10">
            <HomeShelfView shelf={shelf} seeAll={isReleaseShelf(shelf.title) ? { label: "See discography", onClick: openDiscography } : undefined} />
          </div>
        ))}
      </div>
    </>
  );
}
