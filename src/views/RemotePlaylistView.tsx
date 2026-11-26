import { PlayRound } from "../components/PlayRound";
import { Copy, DownloadSimple, ListPlus, Playlist, Shuffle } from "@phosphor-icons/react";
import { ActionMenu } from "../components/ActionMenu";
import { HeroControls } from "../components/BrowseHero";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { SkeletonSwap } from "../components/SkeletonSwap";
import { CollectionHero } from "../components/CollectionHero";
import { HeroIcon } from "../components/HeroIcon";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/ErrorState";
import { PHONE_ICON, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import type { MenuItem } from "../stores/ui";
import { TrackRow } from "../components/TrackRow";
import { getPlaylistPage } from "../lib/browse";
import { copyLink, queueAll } from "../lib/browseActions";
import { thumbArtwork } from "../lib/artwork";
import { downloadAll } from "../lib/downloads";
import { trackMenuItems } from "../lib/trackActions";
import { heroCover, ownerCredit, youtubePlaylistLink } from "../lib/browseText";
import { usePhone } from "../lib/usePhone";
import { useBrowseLoad } from "../lib/useBrowseLoad";
import { useBrowsePlayback } from "../lib/useBrowsePlayback";
import { useNavigation } from "../stores/navigation";

type PlaylistPage = Awaited<ReturnType<typeof getPlaylistPage>>;

const HEADER_ART = 176;

export function RemotePlaylistView() {
  const playlistId = useNavigation((state) => state.view.param) ?? "";
  const { state, retry } = useBrowseLoad(playlistId, getPlaylistPage);

  if (state.status === "error") {
    return (
      <div className="pt-10">
        <ErrorState
          title="Couldn't load this playlist"
          message="This is usually a connection hiccup. Give it another try."
          action={{ label: "Try again", onClick: retry }}
        />
      </div>
    );
  }
  return (
    <SkeletonSwap loading={state.status === "loading"} skeleton={<BrowseSkeleton rows={7} />}>
      {state.status === "loading" ? null : (
        <div className="animate-fade-in">
          <PlaylistContent page={state.data} playlistId={playlistId} />
        </div>
      )}
    </SkeletonSwap>
  );
}

function PlaylistContent({ page, playlistId }: { page: PlaylistPage; playlistId: string }) {
  const { tracks } = page;
  const { current, playing, playAt, shuffle } = useBrowsePlayback(tracks);
  const phone = usePhone();
  const empty = tracks.length === 0;
  const credit = ownerCredit(page.credit);
  const cover = phone ? thumbArtwork(page.thumb, HEADER_ART) || null : heroCover(page.thumb);

  const menu: MenuItem[] = [
    {
      label: "Add all to queue",
      icon: ListPlus,
      disabled: tracks.length === 0,
      onSelect: () => queueAll(tracks, "Playlist added to queue"),
    },
    {
      label: "Download all",
      icon: DownloadSimple,
      disabled: tracks.length === 0,
      onSelect: () => downloadAll(tracks, page.title),
    },
    { label: "Copy link", icon: Copy, onSelect: () => copyLink(youtubePlaylistLink(playlistId)) },
  ];

  const facts = (
    <>
      {credit && (
        <>
          <span className="font-medium text-ink-1">{credit}</span>
          <span aria-hidden="true" className="mx-1.5">·</span>
        </>
      )}
      <span className="tabular-nums">{page.meta}</span>
    </>
  );

  return (
    <>
      {phone ? (
        <CollectionHero
          title={page.title}
          covers={cover ? [cover] : []}
          facts={facts}
          icon={Playlist}
        >
          <PlayRound phone onClick={() => playAt(0)} disabled={empty} />
          <button type="button" aria-label="Shuffle" title="Shuffle" disabled={empty} onClick={shuffle} className={PHONE_SHUFFLE}>
            <HeroIcon icon={Shuffle} />
          </button>
          <ActionMenu items={menu} label="More options" triggerClass={PHONE_ICON} phoneIcon />
        </CollectionHero>
      ) : (
        <PageHeader
          title={page.title}
          artwork={cover}
          meta={facts}
          actions={
            <HeroControls
              onShuffle={shuffle}
              onPlay={() => playAt(0)}
              shuffleDisabled={empty}
              playDisabled={empty}
              menu={menu}
            />
          }
        />
      )}

      <div className={phone ? "pb-14 pt-5" : "pb-12"}>
        {empty ? (
          <p className="py-10 text-center text-meta text-ink-2">This playlist is empty.</p>
        ) : phone ? (
          <ol className="flex flex-col">
            {tracks.map((song, index) => (
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
        ) : (
          <ol className="mt-5">
            {tracks.map((song, index) => (
              <TrackRow
                key={`${song.id}-${index}`}
                index={index}
                song={song}
                current={song.id === current}
                playing={playing}
                artwork
                showAlbum
                menu={() => trackMenuItems(song)}
                onPlay={() => playAt(index)}
              />
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
