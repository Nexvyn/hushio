import { Copy01Icon, Download01Icon, PlayListAddIcon } from "@hugeicons/core-free-icons";
import { HeroControls } from "../components/BrowseHero";
import { BrowseSkeleton } from "../components/BrowseSkeleton";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/ErrorState";
import type { MenuItem } from "../stores/ui";
import { TrackRow } from "../components/TrackRow";
import { getPlaylistPage } from "../lib/browse";
import { copyLink, queueAll} from "../lib/browseActions";
import { downloadAll } from "../lib/downloads";
import { trackMenuItems } from "../lib/trackActions";
import { heroCover, youtubePlaylistLink } from "../lib/browseText";
import { useBrowseLoad } from "../lib/useBrowseLoad";
import { useBrowsePlayback } from "../lib/useBrowsePlayback";
import { useNavigation } from "../stores/navigation";

type PlaylistPage = Awaited<ReturnType<typeof getPlaylistPage>>;

export function RemotePlaylistView() {
  const playlistId = useNavigation((state) => state.view.param) ?? "";
  const { state, retry } = useBrowseLoad(playlistId, getPlaylistPage);

  if (state.status === "loading") return <BrowseSkeleton rows={7} />;
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
  return <PlaylistContent page={state.data} playlistId={playlistId} />;
}

function PlaylistContent({ page, playlistId }: { page: PlaylistPage; playlistId: string }) {
  const { tracks } = page;
  const { current, playing, playAt, shuffle } = useBrowsePlayback(tracks);

  const menu: MenuItem[] = [
    {
      label: "Add all to queue",
      icon: PlayListAddIcon,
      disabled: tracks.length === 0,
      onSelect: () => queueAll(tracks, "Playlist added to queue"),
    },
    {
      label: "Download all",
      icon: Download01Icon,
      disabled: tracks.length === 0,
      onSelect: () => downloadAll(tracks, page.title),
    },
    { label: "Copy link", icon: Copy01Icon, onSelect: () => copyLink(youtubePlaylistLink(playlistId)) },
  ];

  return (
    <>
      <PageHeader
        ambient
        title={page.title}
        artwork={heroCover(page.thumb)}
        meta={
          <>
            {page.credit && (
              <>
                <span className="font-medium text-ink-1">{page.credit}</span>
                <span aria-hidden="true" className="mx-1.5">·</span>
              </>
            )}
            <span className="tabular-nums">{page.meta}</span>
          </>
        }
        actions={
          <HeroControls
            onShuffle={shuffle}
            onPlay={() => playAt(0)}
            shuffleDisabled={tracks.length === 0}
            playDisabled={tracks.length === 0}
            menu={menu}
          />
        }
      />

      <div className="pb-12">
        {tracks.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-ink-2">This playlist is empty.</p>
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
