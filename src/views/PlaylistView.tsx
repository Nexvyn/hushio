import { useRef } from "react";
import { FavouriteIcon, PlayIcon, PlayListAddIcon, PlayListIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "../components/ActionMenu";
import { PILL, ROUND } from "../components/BrowseHero";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { HeroIcon } from "../components/HeroIcon";
import { TrackRow } from "../components/TrackRow";
import { PHONE_ICON, PHONE_PLAY, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { coversOf, topArtist } from "../lib/collections";
import { dropTrackOnTarget, playCollection, playlistHeaderItems, toSong } from "../lib/collectionActions";
import { fmtTotal } from "../lib/format";
import { plural } from "../lib/plural";
import { sortKeys } from "../lib/sortable";
import { playlistTrackMenuItems } from "../lib/trackActions";
import { useSortable } from "../lib/useSortable";
import { usePhone } from "../lib/usePhone";
import { type Playlist, useLibrary } from "../stores/library";
import type { SearchSong } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { playFromRow, usePlayer } from "../stores/player";
import { type MenuItem, useUI } from "../stores/ui";

function searchForSongs() {
  useNavigation.getState().navigate({ name: "home" });
  window.setTimeout(() => document.getElementById("global-search")?.focus(), 80);
}

function phoneRowMenu(playlist: Playlist, index: number, song: SearchSong): MenuItem[] {
  const liked = useLibrary.getState().liked.some((item) => item.id === song.id);
  return [
    ...playlistTrackMenuItems(playlist, index),
    {
      label: liked ? "Remove from Liked Songs" : "Add to Liked Songs",
      icon: FavouriteIcon,
      separatorBefore: true,
      onSelect: () => useLibrary.getState().toggleLike(song),
    },
  ];
}

export function PlaylistView() {
  const id = useNavigation((state) => state.view.param);
  const playlist = useLibrary((state) => state.playlists.find((item) => item.id === id));
  const navigate = useNavigation((state) => state.navigate);
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);
  const listRef = useRef<HTMLOListElement>(null);
  const phone = usePhone();
  const tracks = playlist?.tracks ?? [];
  const keys = sortKeys(tracks.map((track) => track.id));
  const sortable = useSortable({
    keys,
    listRef,
    onMove: (from, to) => {
      if (playlist) useLibrary.getState().moveInPlaylist(playlist.id, from, to);
    },
    canDropOn: (_key, targetId) =>
      targetId === "liked" || (targetId.startsWith("playlist:") && targetId !== `playlist:${playlist?.id}`),
    onDropOn: (key, targetId) => {
      const track = tracks[keys.indexOf(key)];
      if (track) dropTrackOnTarget(targetId, track);
    },
  });

  if (!playlist) {
    return (
      <EmptyState
        icon={PlayListIcon}
        title="This playlist no longer exists"
        message="It may have been deleted. Head back to your playlists to find the rest."
      />
    );
  }

  const empty = tracks.length === 0;
  const total = tracks.reduce((sum, track) => sum + track.duration, 0);
  const top = topArtist(tracks);
  const facts = (
    <>
      {empty ? "No songs yet" : `${plural(tracks.length, "song", "songs")}${total > 0 ? ` · ${fmtTotal(total)}` : ""}`}
      {top && (
        <>
          {" · Top artist: "}
          <span className="font-semibold text-ink-1">{top}</span>
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
    ...playlistHeaderItems(playlist),
  ];

  return (
    <div className="pb-14">
      <CollectionHero
        ambient
        title={playlist.name}
        covers={coversOf(tracks)}
        facts={facts}
        icon={PlayListIcon}
      >
        <button
          type="button"
          aria-label={`Play ${playlist.name}`}
          onClick={() => playCollection(tracks, playlist.id, false)}
          className={phone ? PHONE_PLAY : PILL}
        >
          <HeroIcon icon={PlayIcon} />
          Play
        </button>
        <button
          type="button"
          aria-label="Shuffle"
          title="Shuffle"
          disabled={empty}
          onClick={() => playCollection(tracks, playlist.id, true)}
          className={phone ? PHONE_SHUFFLE : ROUND}
        >
          <HeroIcon icon={ShuffleIcon} />
          {phone && "Shuffle"}
        </button>
        <ActionMenu items={headerMenu} label="More options" triggerClass={phone ? PHONE_ICON : ROUND} phoneIcon={phone} />
      </CollectionHero>

      <div className={phone ? (empty ? "" : "pt-5") : "pt-6"}>
        {empty ? (
          <EmptyState
            icon={PlayListIcon}
            title="Let's find something for your playlist"
            message="Search for songs you love, or browse Explore to discover something new, then right-click any song to add it here."
            action={{ label: "Search for songs", onClick: searchForSongs }}
            secondaryAction={{ label: "Browse Explore", onClick: () => navigate({ name: "explore" }) }}
          />
        ) : (
          <ol ref={listRef} {...sortable.listProps}>
            {tracks.map((track, index) =>
              phone ? (
                <PhoneSongRow
                  key={keys[index]}
                  index={index}
                  song={toSong(track)}
                  current={track.id === currentId}
                  playing={playing}
                  menu={() => phoneRowMenu(playlist, index, toSong(track))}
                  onPlay={() => playFromRow(tracks, index, playlist.id)}
                  rowProps={sortable.bind(keys[index])}
                />
              ) : (
              <TrackRow
                key={keys[index]}
                index={index}
                song={toSong(track)}
                current={track.id === currentId}
                playing={playing}
                menu={() => playlistTrackMenuItems(playlist, index)}
                onPlay={() => playFromRow(tracks, index, playlist.id)}
                artwork
                showAlbum
                rowProps={sortable.bind(keys[index])}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
