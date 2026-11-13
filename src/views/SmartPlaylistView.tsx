import { MagicWand01Icon, PlayIcon, PlayListAddIcon, PlayListIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "../components/ActionMenu";
import { PILL, ROUND } from "../components/BrowseHero";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { HeroIcon } from "../components/HeroIcon";
import { TrackRow } from "../components/TrackRow";
import { PHONE_ICON, PHONE_PLAY, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { coversOf } from "../lib/collections";
import { playCollection, toSong } from "../lib/collectionActions";
import { plural } from "../lib/plural";
import { saveAsPlaylist, SMART_EMPTY_MESSAGE } from "../lib/smartLists";
import { trackMenuItems } from "../lib/trackActions";
import { usePhone } from "../lib/usePhone";
import { useSmartLists } from "../lib/useSmartLists";
import { useNavigation } from "../stores/navigation";
import { playFromRow, usePlayer } from "../stores/player";
import { type MenuItem, useUI } from "../stores/ui";

export function SmartPlaylistView() {
  const param = useNavigation((state) => state.view.param);
  const navigate = useNavigation((state) => state.navigate);
  const lists = useSmartLists();
  const list = lists.find((item) => item.id === param);
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);
  const phone = usePhone();

  if (!list) {
    return (
      <EmptyState
        icon={MagicWand01Icon}
        title="This list is not available"
        message="Pick a list from Made for you in your library."
        action={{ label: "Open Your Library", onClick: () => navigate({ name: "library" }) }}
      />
    );
  }

  const tracks = list.tracks;
  const empty = tracks.length === 0;
  const source = `smart:${list.id}`;
  const headerMenu: MenuItem[] = [
    {
      label: "Add all to queue",
      icon: PlayListAddIcon,
      disabled: empty,
      onSelect: () => {
        usePlayer.getState().addToQueue(tracks);
        useUI.getState().toast("Added to queue");
      },
    },
    {
      label: "Save as playlist",
      icon: PlayListIcon,
      disabled: empty,
      onSelect: () => {
        const id = saveAsPlaylist(list.title, tracks);
        useUI.getState().toast("Saved as playlist", "success");
        navigate({ name: "playlist", param: id });
      },
    },
  ];

  return (
    <div className="pb-16">
      <CollectionHero
        title={list.title}
        covers={coversOf(tracks)}
        facts={empty ? "No songs yet" : plural(tracks.length, "song", "songs")}
        icon={MagicWand01Icon}
      >
        <button
          type="button"
          aria-label={`Play ${list.title}`}
          disabled={empty}
          onClick={() => playCollection(tracks, source, false)}
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
          onClick={() => playCollection(tracks, source, true)}
          className={phone ? PHONE_SHUFFLE : ROUND}
        >
          <HeroIcon icon={ShuffleIcon} />
          {phone && "Shuffle"}
        </button>
        <ActionMenu items={headerMenu} label="More options" triggerClass={phone ? PHONE_ICON : ROUND} phoneIcon={phone} />
      </CollectionHero>

      <div className={phone ? (empty ? "" : "mt-5") : `mt-6 ${empty ? "flex min-h-[50vh] flex-col" : ""}`}>
        {empty ? (
          <EmptyState centered icon={MagicWand01Icon} title="Nothing here yet" message={SMART_EMPTY_MESSAGE} />
        ) : (
          <ol>
            {tracks.map((track, index) => {
              const song = toSong(track);
              if (phone) {
                return (
                  <PhoneSongRow
                    key={`${track.id}-${index}`}
                    index={index}
                    song={song}
                    current={track.id === currentId}
                    playing={playing}
                    menu={() => trackMenuItems(song)}
                    onPlay={() => playFromRow(tracks, index, source)}
                  />
                );
              }
              return (
                <TrackRow
                  key={`${track.id}-${index}`}
                  index={index}
                  song={song}
                  current={track.id === currentId}
                  playing={playing}
                  menu={() => trackMenuItems(song)}
                  onPlay={() => playFromRow(tracks, index, source)}
                  artwork
                  showAlbum
                />
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
