import { Album01Icon, Copy01Icon, Download01Icon, PlayIcon, PlayListAddIcon, ShuffleIcon, UserIcon } from "@hugeicons/core-free-icons";
import { normalizeCredit } from "../lib/credits";
import { AboutText } from "../components/AboutText";
import { ActionMenu } from "../components/ActionMenu";
import { HeroControls } from "../components/BrowseHero";
import { HeroIcon } from "../components/HeroIcon";
import { PageHeader } from "../components/PageHeader";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { ErrorState } from "../components/ErrorState";
import type { MenuItem } from "../stores/ui";
import { TrackRow } from "../components/TrackRow";
import { PHONE_ICON, PHONE_PLAY, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { usePhone } from "../lib/usePhone";
import { getAlbumPage } from "../lib/browse";
import type { ReleasePage } from "../lib/browseParse";
import { addedMessage, copyLink, queueAll} from "../lib/browseActions";
import { downloadAll } from "../lib/downloads";
import { trackMenuItems } from "../lib/trackActions";
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
import { useNavigation } from "../stores/navigation";

export function AlbumView() {
  const albumId = useNavigation((state) => state.view.param) ?? "";
  const { state, retry } = useBrowseLoad(albumId, getAlbumPage);

  if (state.status === "loading") return <BrowseSkeleton rows={7} />;
  if (state.status === "error") {
    return (
      <div className="pt-10">
        <ErrorState
          title="Couldn't load this album"
          message="Check your connection and try again — the album page will be right here."
          action={{ label: "Try again", onClick: retry }}
        />
      </div>
    );
  }
  return <AlbumContent page={state.data} />;
}

function AlbumContent({ page }: { page: ReleasePage }) {
  const navigate = useNavigation((state) => state.navigate);
  const { album, tracks } = page;
  const artistId = album.artistId ?? peekArtistMeta(album.artist)?.id ?? null;
  const headline = shortTitle(album.title);
  const source = titleSource(album.title);
  const { current, playing, playAt, shuffle } = useBrowsePlayback(tracks);
  const phone = usePhone();

  const menu: MenuItem[] = [
    {
      label: "Go to artist",
      icon: UserIcon,
      disabled: artistId === null,
      onSelect: () => {
        if (artistId) navigate({ name: "artist", param: artistId });
      },
    },
    {
      label: "Add all to queue",
      icon: PlayListAddIcon,
      disabled: tracks.length === 0,
      onSelect: () => queueAll(tracks, addedMessage(tracks.length)),
    },
    {
      label: "Download all",
      icon: Download01Icon,
      disabled: tracks.length === 0,
      onSelect: () => downloadAll(tracks, album.title),
    },
    { label: "Copy link", icon: Copy01Icon, onSelect: () => copyLink(youtubeAlbumLink(album.id)) },
  ];

  return (
    <>
      <PageHeader
        ambient
        title={headline}
        titleTooltip={headline === album.title ? undefined : album.title}
        artwork={heroCover(album.thumb)}
        icon={Album01Icon}
        meta={
          <>
            {album.artist &&
              (artistId ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate({ name: "artist", param: artistId })}
                    className="font-semibold text-accent hover:underline"
                  >
                    {normalizeCredit(album.artist)}
                  </button>
                  <span aria-hidden="true" className="mx-1.5">·</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-accent">{normalizeCredit(album.artist)}</span>
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
                <HeroIcon icon={PlayIcon} />
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
                <HeroIcon icon={ShuffleIcon} />
                Shuffle
              </button>
              <ActionMenu items={menu} label="More options" triggerClass={PHONE_ICON} phoneIcon />
            </>
          ) : (
            <HeroControls
              onShuffle={shuffle}
              onPlay={() => playAt(0)}
              shuffleDisabled={tracks.length === 0}
              playDisabled={tracks.length === 0}
              menu={menu}
            />
          )
        }
      />

      <div className="pb-12">
        {album.description && (
          <div className="mt-7">
            <AboutText heading="About the album" text={album.description} />
          </div>
        )}
        <ol className={phone ? "mt-5" : "mt-7"}>
          {tracks.map((song, index) =>
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
      </div>
    </>
  );
}
