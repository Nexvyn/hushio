import { Copy01Icon, Download01Icon, PlayListAddIcon, UserIcon } from "@hugeicons/core-free-icons";
import { AboutText } from "../components/AboutText";
import { BrowseHero, HeroControls } from "../components/BrowseHero";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { ErrorState } from "../components/ErrorState";
import type { MenuItem } from "../stores/ui";
import { TrackRow } from "../components/TrackRow";
import { getAlbumPage } from "../lib/browse";
import type { ReleasePage } from "../lib/browseParse";
import { addedMessage, copyLink, queueAll} from "../lib/browseActions";
import { trackMenuItems } from "../lib/trackActions";
import {
  albumMeta,
  heroCover,
  pageTitleSize,
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
    { label: "Download all", icon: Download01Icon, disabled: true },
    { label: "Copy link", icon: Copy01Icon, onSelect: () => copyLink(youtubeAlbumLink(album.id)) },
  ];

  return (
    <div>
      <BrowseHero cover={heroCover(album.thumb)} topPadding="pt-[240px]">
        <h1
          title={headline === album.title ? undefined : album.title}
          className={`${pageTitleSize(headline)} max-w-[768px] font-extrabold leading-[1.2] tracking-[-0.03em]`}
        >
          {headline}
        </h1>
        {source && <p className="mt-1 text-[13px] text-white/60">From {source}</p>}
        {artistId ? (
          <button
            type="button"
            onClick={() => navigate({ name: "artist", param: artistId })}
            className="mt-2 text-[15px] font-medium text-accent"
          >
            {album.artist}
          </button>
        ) : (
          <p className="mt-2 text-[15px] font-medium text-accent">{album.artist}</p>
        )}
        <p className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">
          {albumMeta(album.releaseType, album.year, tracks.length)}
        </p>
        <HeroControls
          onShuffle={shuffle}
          onPlay={() => playAt(0)}
          shuffleDisabled={tracks.length === 0}
          playDisabled={tracks.length === 0}
          menu={menu}
        />
      </BrowseHero>

      <div className="px-8 pb-12">
        {album.description && (
          <div className="mt-7">
            <AboutText heading="About the album" text={album.description} />
          </div>
        )}
        <ol className="mt-7">
          {tracks.map((song, index) => (
            <TrackRow
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
      </div>
    </div>
  );
}
