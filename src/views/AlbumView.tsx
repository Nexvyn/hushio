import { useEffect, useMemo, useState } from "react";
import { VinylRecord, Check, Copy, DownloadSimple, Play, ListPlus, Plus, Shuffle, User } from "@phosphor-icons/react";
import { normalizeCredit } from "../lib/credits";
import { AboutText } from "../components/AboutText";
import { ActionMenu } from "../components/ActionMenu";
import { arrangeTracks, CollectionActions, FILTER_MIN_TRACKS, PhoneTrackFilter, TrackTools } from "../components/TrackListControls";
import { ALBUM_FIELDS, CUSTOM_SORT, type TrackSort } from "../lib/trackSort";
import { HeroIcon } from "../components/HeroIcon";
import { HomeShelfView, shelfMenu } from "../components/HomeShelves";
import { PageHeader } from "../components/PageHeader";
import { PhoneSectionHeader, PhoneShelfArt, PhoneShelfCard, PhoneShelfRow } from "../components/phone/PhoneShelf";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { SkeletonSwap } from "../components/SkeletonSwap";
import { ErrorState } from "../components/ErrorState";
import type { MenuItem } from "../stores/ui";
import { TrackRow } from "../components/TrackRow";
import { PHONE_ICON, PHONE_PLAY, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { PhoneIcon } from "../components/phone/PhoneIcon";
import { useFirstLoadStagger } from "../components/phone/useFirstLoadStagger";
import { usePhone } from "../lib/usePhone";
import { getAlbumPage } from "../lib/browse";
import type { AlbumInfo, ReleasePage } from "../lib/browseParse";
import { getMoreByArtist } from "../lib/discography";
import type { HomeShelf } from "../lib/home";
import { addedMessage, copyLink, queueAll} from "../lib/browseActions";
import { downloadAll } from "../lib/downloads";
import { trackMenuItems } from "../lib/trackActions";
import { prefetchFirst } from "../lib/prefetch";
import {
  albumMeta,
  heroCover,
  shortTitle,
  titleSource,
  youtubeAlbumLink,
} from "../lib/browseText";
import { useBrowseLoad } from "../lib/useBrowseLoad";
import { useBrowsePlayback } from "../lib/useBrowsePlayback";
import { peekArtistMeta } from "../stores/artistMeta";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";

export function AlbumView() {
  const albumId = useNavigation((state) => state.view.param) ?? "";
  const { state, retry } = useBrowseLoad(albumId, getAlbumPage);

  if (state.status === "error") {
    return (
      <div className="pt-10">
        <ErrorState
          title="Couldn't load this album"
          message="Check your connection and try again. The album page will be right here."
          action={{ label: "Try again", onClick: retry }}
        />
      </div>
    );
  }
  return (
    <SkeletonSwap loading={state.status === "loading"} skeleton={<BrowseSkeleton rows={7} />}>
      {state.status === "loading" ? null : (
        <div className="animate-fade-in">
          <AlbumContent page={state.data} />
        </div>
      )}
    </SkeletonSwap>
  );
}

function AlbumContent({ page }: { page: ReleasePage }) {
  const navigate = useNavigation((state) => state.navigate);
  const { album, tracks } = page;
  const leadIds = tracks.slice(0, 3).map((track) => track.id).join("|");
  useEffect(() => prefetchFirst(leadIds.split("|")), [leadIds]);
  const artistId = album.artistId ?? peekArtistMeta(album.artist)?.id ?? null;
  const headline = shortTitle(album.title);
  const source = titleSource(album.title);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TrackSort>(CUSTOM_SORT);
  const filterable = tracks.length >= FILTER_MIN_TRACKS;
  const activeQuery = filterable ? query : "";
  const visible = useMemo(() => arrangeTracks(tracks, activeQuery, sort), [tracks, activeQuery, sort]);
  const visibleTracks = useMemo(() => visible.map((row) => row.item), [visible]);
  const { current, playing, playAt, shuffle } = useBrowsePlayback(visibleTracks);
  const phone = usePhone();
  const stagger = useFirstLoadStagger(visible.length > 0);
  const saved = useLibrary((state) => state.savedAlbums.some((item) => item.id === album.id));
  const savedLabel = saved ? "Remove from Your Library" : "Save to Your Library";
  const toggleSaved = () => {
    const library = useLibrary.getState();
    if (saved) {
      library.removeSavedAlbum(album.id);
      return;
    }
    library.saveAlbum({
      id: album.id,
      title: album.title,
      artist: album.artist,
      thumb: album.thumb ?? undefined,
      year: album.year ?? undefined,
      trackIds: tracks.map((track) => track.id),
    });
  };

  const menu: MenuItem[] = [
    {
      label: "Go to artist",
      icon: User,
      disabled: artistId === null,
      onSelect: () => {
        if (artistId) navigate({ name: "artist", param: artistId });
      },
    },
    {
      label: "Add all to queue",
      icon: ListPlus,
      disabled: tracks.length === 0,
      onSelect: () => queueAll(tracks, addedMessage(tracks.length)),
    },
    {
      label: "Download all",
      icon: DownloadSimple,
      disabled: tracks.length === 0,
      onSelect: () => downloadAll(tracks, album.title),
    },
    { label: savedLabel, icon: saved ? Check : Plus, onSelect: toggleSaved },
    { label: "Copy link", icon: Copy, onSelect: () => copyLink(youtubeAlbumLink(album.id)) },
  ];

  const desktopFooter = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <CollectionActions
        playLabel="Play"
        disabled={tracks.length === 0}
        onPlay={() => playAt(0)}
        onShuffle={shuffle}
        onDownload={() => downloadAll(tracks, album.title)}
        saved={saved}
        onToggleSaved={toggleSaved}
        menu={menu}
      />
      {tracks.length > 0 && (
        <TrackTools
          query={activeQuery}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          customLabel="Album order"
          fields={ALBUM_FIELDS}
          filterable={filterable}
        />
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={headline}
        eyebrow="Album"
        footer={phone ? undefined : desktopFooter}
        titleTooltip={headline === album.title ? undefined : album.title}
        artwork={heroCover(album.thumb)}
      sharedArtworkId={`cover:album:${album.id}`}
        icon={VinylRecord}
        meta={
          <>
            {album.artist &&
              (artistId ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate({ name: "artist", param: artistId })}
                    className={phone ? "font-semibold hover:underline" : "font-semibold text-accent hover:underline"}
                  >
                    {normalizeCredit(album.artist)}
                  </button>
                  <span aria-hidden="true" className="mx-1.5">·</span>
                </>
              ) : (
                <>
                  <span className={phone ? "font-semibold" : "font-semibold text-accent"}>{normalizeCredit(album.artist)}</span>
                  <span aria-hidden="true" className="mx-1.5">·</span>
                </>
              ))}
            <span>{albumMeta(album.releaseType, album.year, tracks.length)}</span>
            {source && (
              <>
                <span aria-hidden="true" className="mx-1.5">·</span>
                <span>From {source}</span>
              </>
            )}
          </>
        }
        actions={
          phone ? (
            <>
              <button type="button" disabled={tracks.length === 0} onClick={() => playAt(0)} className={PHONE_PLAY}>
                <HeroIcon icon={Play} />
                Play
              </button>
              <button
                type="button"
                aria-label="Shuffle"
                title="Shuffle"
                disabled={tracks.length === 0}
                onClick={shuffle}
                className={PHONE_SHUFFLE}
              >
                <HeroIcon icon={Shuffle} />
                Shuffle
              </button>
              <button type="button" aria-label={savedLabel} title={savedLabel} onClick={toggleSaved} className={PHONE_ICON}>
                <PhoneIcon icon={saved ? Check : Plus} />
              </button>
              <ActionMenu items={menu} label="More options" triggerClass={PHONE_ICON} phoneIcon />
            </>
          ) : null
        }
      />

      <div className="pb-12">
        {album.description && (
          <div className="mt-7">
            <AboutText heading="About the album" text={album.description} />
          </div>
        )}
        {phone && <div className="mt-5"><PhoneTrackFilter query={query} onQuery={setQuery} count={tracks.length} /></div>}
        <ol className={phone ? `mt-5 ${stagger.className}` : `mt-7 ${stagger.className}`} onAnimationEnd={stagger.onAnimationEnd}>
          {visible.map(({ item: song }, index) =>
            phone ? (
              <PhoneSongRow
                key={`${song.id}-${index}`}
                index={index}
                song={song}
                current={song.id === current}
                playing={playing}
                menu={() => trackMenuItems(song)}
                onPlay={() => playAt(index)}
                numbered
                showArtist={song.artist !== album.artist}
              />
            ) : (
              <TrackRow
                key={`${song.id}-${index}`}
                index={index}
                song={song}
                current={song.id === current}
                playing={playing}
                menu={() => trackMenuItems(song)}
                onPlay={() => playAt(index)}
              />
            ),
          )}
        </ol>
        {tracks.length > 0 && visible.length === 0 && (
          <p className="py-10 text-center text-meta text-ink-2">No songs match this filter.</p>
        )}
        <ReleaseNotes album={album} artistId={artistId} />
        <MoreByArtist albumId={album.id} artistId={artistId} />
      </div>
    </>
  );
}

function ReleaseNotes({ album, artistId }: { album: AlbumInfo; artistId: string | null }) {
  const navigate = useNavigation((state) => state.navigate);
  const released = album.releaseDate ? `Released ${album.releaseDate}` : album.year;
  if (!released && album.copyright.length === 0 && !artistId) return null;
  return (
    <div className="mt-8 flex flex-col gap-1 text-meta text-ink-2">
      {released && <p>{released}</p>}
      {album.copyright.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {artistId && (
        <button
          type="button"
          onClick={() => navigate({ name: "discography", param: artistId })}
          className="mt-2 w-fit font-medium text-accent hover:underline"
        >
          See discography
        </button>
      )}
    </div>
  );
}

function MoreByArtist({ albumId, artistId }: { albumId: string; artistId: string | null }) {
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const [shelf, setShelf] = useState<HomeShelf | null>(null);

  useEffect(() => {
    setShelf(null);
    if (!artistId) return;
    let live = true;
    getMoreByArtist(artistId, albumId).then(
      (next) => {
        if (live) setShelf(next);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [artistId, albumId]);

  if (!artistId || !shelf) return null;
  const openDiscography = () => navigate({ name: "discography", param: artistId });

  if (!phone) {
    return (
      <div className="mt-10">
        <HomeShelfView shelf={shelf} seeAll={{ label: "See discography", onClick: openDiscography }} />
      </div>
    );
  }
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <PhoneSectionHeader title={shelf.title} />
        <button type="button" onClick={openDiscography} className="shrink-0 text-meta font-medium text-accent">
          See discography
        </button>
      </div>
      <PhoneShelfRow>
        {shelf.items.flatMap((item) =>
          item.kind === "album"
            ? [
                <PhoneShelfCard
                  key={item.id}
                  art={<PhoneShelfArt src={item.thumb} variant="large" />}
                  variant="large"
                  title={item.title}
                  subtitle={item.artist}
                  menu={() => shelfMenu(item)}
                  onActivate={() => navigate({ name: "album", param: item.id })}
                />,
              ]
            : [],
        )}
      </PhoneShelfRow>
    </section>
  );
}
