import { FavouriteIcon, PlayIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { PILL, ROUND } from "../components/BrowseHero";
import { TrackRow } from "../components/TrackRow";
import { upgradeArtwork } from "../lib/artwork";
import { songMenu } from "../lib/browseActions";
import { fmtTotal } from "../lib/format";
import { plural } from "../lib/plural";
import type { SearchSong } from "../lib/searchParse";
import { type LibraryTrack, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { playFromRow, usePlayer } from "../stores/player";

const LIKED_SOURCE = "__liked__";

function asSong(track: LibraryTrack): SearchSong {
  return { ...track, artistId: null, albumId: null, isVideo: false };
}

function mostLikedArtist(tracks: LibraryTrack[]): string | null {
  const counts = new Map<string, number>();
  for (const track of tracks) counts.set(track.artist, (counts.get(track.artist) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [artist, count] of counts) {
    if (count > bestCount) {
      best = artist;
      bestCount = count;
    }
  }
  return best;
}

function playLiked(tracks: LibraryTrack[], shuffle: boolean) {
  if (tracks.length === 0) return;
  if (shuffle) usePlayer.setState({ shuffle: true });
  const start = shuffle ? Math.floor(Math.random() * tracks.length) : 0;
  usePlayer.getState().playQueue(tracks, start, LIKED_SOURCE);
}

export function LikedView() {
  const liked = useLibrary((state) => state.liked);
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);
  const navigate = useNavigation((state) => state.navigate);
  const empty = liked.length === 0;
  const top = mostLikedArtist(liked);
  const total = liked.reduce((sum, track) => sum + track.duration, 0);
  const covers = liked.flatMap((track) => {
    const art = upgradeArtwork(track.thumb);
    return art ? [art] : [];
  });

  const facts = (
    <>
      {plural(liked.length, "song", "songs")} · {fmtTotal(total)}
      {top && (
        <>
          {" · Your most liked: "}
          <span className="font-semibold text-white">{top}</span>
        </>
      )}
    </>
  );

  return (
    <div className="pb-16">
      <CollectionHero icon={FavouriteIcon} kind="Liked by you" title="Liked Songs" covers={covers} facts={facts}>
        <button
          type="button"
          aria-label="Play Liked Songs"
          disabled={empty}
          onClick={() => playLiked(liked, false)}
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
          onClick={() => playLiked(liked, true)}
          className={ROUND}
        >
          <Icon icon={ShuffleIcon} />
        </button>
      </CollectionHero>

      <div className="mt-6">
        {empty ? (
          <EmptyState
            icon={FavouriteIcon}
            title="Songs you like will show up here"
            message="Click the heart on any song, in the player, a playlist or search, and it lands here. Its cover joins the wall above."
            action={{ label: "Find something to like", onClick: () => navigate({ name: "search" }) }}
          />
        ) : (
          <ol>
            {liked.map((track, index) => {
              const song = asSong(track);
              return (
                <TrackRow
                  key={`${track.id}-${index}`}
                  index={index}
                  song={song}
                  current={track.id === currentId}
                  playing={playing}
                  menu={songMenu(song)}
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
