import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  PlayIcon,
  PlayListAddIcon,
  PlayListIcon,
  ShuffleIcon,
} from "@hugeicons/core-free-icons";
import { ActionMenu, type MenuItem } from "../components/ActionMenu";
import { PILL, ROUND } from "../components/BrowseHero";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { TrackRow } from "../components/TrackRow";
import { coversOf, topArtist } from "../lib/collections";
import { playCollection, playlistMenuItems, toSong } from "../lib/collectionActions";
import { songMenu } from "../lib/browseActions";
import { fmtTotal } from "../lib/format";
import { plural } from "../lib/plural";
import { type LibraryTrack, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { playFromRow, usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

function trackMenu(playlistId: string, tracks: LibraryTrack[], index: number): MenuItem[] {
  const track = tracks[index];
  return [
    ...songMenu(toSong(track)),
    {
      label: "Move up",
      icon: ArrowUp01Icon,
      disabled: index === 0,
      separatorBefore: true,
      onSelect: () => useLibrary.getState().moveInPlaylist(playlistId, index, index - 1),
    },
    {
      label: "Move down",
      icon: ArrowDown01Icon,
      disabled: index === tracks.length - 1,
      onSelect: () => useLibrary.getState().moveInPlaylist(playlistId, index, index + 1),
    },
    {
      label: "Remove from playlist",
      icon: Delete02Icon,
      separatorBefore: true,
      onSelect: () => useLibrary.getState().removeFromPlaylist(playlistId, track.id),
    },
  ];
}

function searchForSongs() {
  useNavigation.getState().navigate({ name: "home" });
  window.setTimeout(() => document.getElementById("global-search")?.focus(), 80);
}

export function PlaylistView() {
  const id = useNavigation((state) => state.view.param);
  const playlist = useLibrary((state) => state.playlists.find((item) => item.id === id));
  const navigate = useNavigation((state) => state.navigate);
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);

  if (!playlist) {
    return (
      <EmptyState
        icon={PlayListIcon}
        title="This playlist no longer exists"
        message="It may have been deleted. Head back to your playlists to find the rest."
      />
    );
  }

  const tracks = playlist.tracks;
  const empty = tracks.length === 0;
  const total = tracks.reduce((sum, track) => sum + track.duration, 0);
  const top = topArtist(tracks);
  const facts = (
    <>
      {empty ? "No songs yet" : `${plural(tracks.length, "song", "songs")} · ${fmtTotal(total)}`}
      {top && (
        <>
          {" · Top artist: "}
          <span className="font-semibold text-white">{top}</span>
        </>
      )}
    </>
  );
  const headerMenu: MenuItem[] = [
    {
      label: "Add all to queue",
      icon: PlayListAddIcon,
      onSelect: () => {
        usePlayer.getState().addToQueue(tracks);
        useUI.getState().toast("Playlist added to queue");
      },
    },
    ...playlistMenuItems(playlist.id, playlist.pinned),
  ];

  return (
    <div className="pb-14">
      <CollectionHero
        icon={PlayListIcon}
        kind="Your playlist"
        title={playlist.name}
        covers={coversOf(tracks)}
        facts={facts}
      >
        <button
          type="button"
          aria-label={`Play ${playlist.name}`}
          onClick={() => playCollection(tracks, playlist.id, false)}
          className={PILL}
        >
          <Icon icon={PlayIcon} />
          Play
        </button>
        <button
          type="button"
          aria-label="Shuffle"
          title="Shuffle"
          disabled={empty}
          onClick={() => playCollection(tracks, playlist.id, true)}
          className={ROUND}
        >
          <Icon icon={ShuffleIcon} />
        </button>
        <ActionMenu items={headerMenu} label="More options" triggerClass={ROUND} />
      </CollectionHero>

      <div className="pt-6">
        {empty ? (
          <EmptyState
            icon={PlayListIcon}
            title="Let's find something for your playlist"
            message="Search for songs you love, or browse Explore to discover something new, then right-click any song to add it here. Its cover joins the wall above."
            action={{ label: "Search for songs", onClick: searchForSongs }}
            secondaryAction={{ label: "Browse Explore", onClick: () => navigate({ name: "explore" }) }}
          />
        ) : (
          <ol>
            {tracks.map((track, index) => (
              <TrackRow
                key={`${track.id}-${index}`}
                index={index}
                song={toSong(track)}
                current={track.id === currentId}
                playing={playing}
                menu={trackMenu(playlist.id, tracks, index)}
                onPlay={() => playFromRow(tracks, index, playlist.id)}
                artwork
                showAlbum
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
