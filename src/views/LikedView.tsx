import { FavouriteIcon, PlayIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { HeroIcon } from "../components/HeroIcon";
import { PILL, ROUND } from "../components/BrowseHero";
import { TrackRow } from "../components/TrackRow";
import { PHONE_PLAY, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { coversOf, topArtist } from "../lib/collections";
import { playCollection, toSong } from "../lib/collectionActions";
import { trackMenuItems } from "../lib/trackActions";
import { fmtTotal } from "../lib/format";
import { plural } from "../lib/plural";
import { usePhone } from "../lib/usePhone";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { playFromRow, usePlayer } from "../stores/player";

const LIKED_SOURCE = "__liked__";

export function LikedView() {
  const liked = useLibrary((state) => state.liked);
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const empty = liked.length === 0;
  const top = topArtist(liked);
  const total = liked.reduce((sum, track) => sum + track.duration, 0);
  const covers = coversOf(liked);

  const facts = (
    <>
      {plural(liked.length, "song", "songs")} · {fmtTotal(total)}
      {top && (
        <>
          {" · Your most liked: "}
          <span className="font-semibold text-ink-1">{top}</span>
        </>
      )}
    </>
  );

  return (
    <div className="pb-16">
      <CollectionHero title="Liked Songs" covers={covers} facts={facts} icon={FavouriteIcon}>
        <button
          type="button"
          aria-label="Play Liked Songs"
          disabled={empty}
          onClick={() => playCollection(liked, LIKED_SOURCE, false)}
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
          onClick={() => playCollection(liked, LIKED_SOURCE, true)}
          className={phone ? PHONE_SHUFFLE : ROUND}
        >
          <HeroIcon icon={ShuffleIcon} />
          {phone && "Shuffle"}
        </button>
      </CollectionHero>

      <div className={phone ? (empty ? "" : "mt-5") : `mt-6 ${empty ? "flex min-h-[50vh] flex-col" : ""}`}>
        {empty ? (
          <EmptyState
            centered
            icon={FavouriteIcon}
            title="No liked songs yet"
            message="Tap the heart on any song to keep it here."
            action={{ label: "Find songs", onClick: () => navigate({ name: "search" }) }}
          />
        ) : (
          <ol>
            {liked.map((track, index) => {
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
                    onPlay={() => playFromRow(liked, index, LIKED_SOURCE)}
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
                  onPlay={() => playFromRow(liked, index, LIKED_SOURCE)}
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
