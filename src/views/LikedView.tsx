import { useFirstLoadStagger } from "../components/phone/useFirstLoadStagger";
import { useRef, useState } from "react";
import { Heart, Play, ListPlus, Shuffle } from "@phosphor-icons/react";
import { CollectionHero } from "../components/CollectionHero";
import { EmptyState } from "../components/EmptyState";
import { HeroIcon } from "../components/HeroIcon";
import { arrangeTracks, CollectionActions, TrackTools } from "../components/TrackListControls";
import { TrackListHeader, TrackRow } from "../components/TrackRow";
import { PHONE_PLAY, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { PhoneSongRow } from "../components/phone/PhoneTrackRow";
import { coversOf, topArtist } from "../lib/collections";
import { playCollection, toSong } from "../lib/collectionActions";
import { dropTracksOnTarget, QUEUE_TARGET } from "../lib/trackDrop";
import { selectionMenuItems } from "../lib/selectionMenu";
import { useTrackSelection } from "../lib/useTrackSelection";
import { useSortable } from "../lib/useSortable";
import { sortKeys } from "../lib/sortable";
import { downloadAll } from "../lib/downloads";
import { trackMenuItems } from "../lib/trackActions";
import { fmtTotal } from "../lib/format";
import { plural } from "../lib/plural";
import { usePhone } from "../lib/usePhone";
import { TRACK_FIELDS } from "../lib/trackSort";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useStoredTrackSort } from "../stores/trackSort";
import { playFromRow, usePlayer } from "../stores/player";
import { type MenuItem, useUI } from "../stores/ui";

const LIKED_SOURCE = "__liked__";

export function LikedView() {
  const liked = useLibrary((state) => state.liked);
  const currentId = usePlayer((state) => state.queue[state.index]?.id);
  const playing = usePlayer((state) => state.playing);
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useStoredTrackSort("liked");
  const empty = liked.length === 0;
  const top = topArtist(liked);
  const total = liked.reduce((sum, track) => sum + track.duration, 0);
  const covers = coversOf(liked);
  const visible = arrangeTracks(liked, query, sort);
  const visibleTracks = visible.map((row) => row.item);
  const stagger = useFirstLoadStagger(visibleTracks.length > 0);
  const listRef = useRef<HTMLOListElement>(null);
  const keys = sortKeys(visibleTracks.map((track) => track.id));
  const selection = useTrackSelection("liked", visibleTracks.map((track) => track.id));
  const sortable = useSortable({
    keys,
    listRef,
    reorder: false,
    canDropOn: (_key, targetId) => targetId === QUEUE_TARGET || targetId.startsWith("playlist:"),
    onDropOn: (key, targetId, point) => {
      const dragged = visibleTracks[keys.indexOf(key)];
      if (!dragged) return;
      const group = selection.isSelected(dragged.id)
        ? visibleTracks.filter((track) => selection.isSelected(track.id))
        : [dragged];
      dropTracksOnTarget(targetId, group.map(toSong), point);
    },
  });

  function selectedMenu(): MenuItem[] {
    return selectionMenuItems(visibleTracks.filter((track) => selection.isSelected(track.id)).map(toSong));
  }

  function playAt(position: number) {
    playFromRow(visibleTracks, position, LIKED_SOURCE);
  }


  const facts = (
    <>
      {plural(liked.length, "song", "songs")}
      {total > 0 && ` · ${fmtTotal(total)}`}
      {top && (
        <>
          {" · Your most liked: "}
          <span className="font-semibold text-ink-1">{top}</span>
        </>
      )}
    </>
  );

  const footer = phone ? undefined : (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <CollectionActions
        playLabel="Play Liked Songs"
        disabled={empty}
        onPlay={() => playCollection(liked, LIKED_SOURCE, false)}
        onShuffle={() => playCollection(liked, LIKED_SOURCE, true)}
        onDownload={() => downloadAll(liked, "Liked Songs")}
        menu={[
          {
            label: "Add all to queue",
            icon: ListPlus,
            disabled: empty,
            onSelect: () => {
              usePlayer.getState().addToQueue(liked);
              useUI.getState().toast("Liked Songs added to queue");
            },
          },
        ]}
      />
      {!empty && <TrackTools query={query} onQuery={setQuery} sort={sort} onSort={setSort} fields={TRACK_FIELDS} />}
    </div>
  );

  return (
    <div className="pb-16">
      <CollectionHero title="Liked Songs" covers={covers} facts={facts} icon={Heart} tile={{ icon: Heart, accent: true }} eyebrow="Playlist" footer={footer}>
        {phone && (
          <>
            <button
              type="button"
              aria-label="Play Liked Songs"
              disabled={empty}
              onClick={() => playCollection(liked, LIKED_SOURCE, false)}
              className={PHONE_PLAY}
            >
              <HeroIcon icon={Play} />
              Play
            </button>
            <button
              type="button"
              aria-label="Shuffle"
              title="Shuffle"
              disabled={empty}
              onClick={() => playCollection(liked, LIKED_SOURCE, true)}
              className={PHONE_SHUFFLE}
            >
              <HeroIcon icon={Shuffle} />
              Shuffle
            </button>
          </>
        )}
      </CollectionHero>

      <div className={phone ? (empty ? "" : "mt-5") : `mt-6 ${empty ? "flex min-h-[50vh] flex-col" : ""}`}>
        {empty ? (
          <EmptyState
            centered
            icon={Heart}
            title="No liked songs yet"
            message="Tap the heart on any song to keep it here."
            action={{ label: "Find songs", onClick: () => navigate({ name: "search" }) }}
          />
        ) : (
          <>
            {!phone && <TrackListHeader showAlbum showAdded />}
            <ol ref={listRef} className={stagger.className || undefined} onAnimationEnd={stagger.onAnimationEnd} {...sortable.listProps} onKeyDown={(event) => selection.onListKeyDown(event)}>
              {visible.map(({ item: track, index }, position) => {
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
                    key={keys[position]}
                    index={position}
                    song={song}
                    current={track.id === currentId}
                    playing={playing}
                    menu={() =>
                      selection.isSelected(track.id) && selection.count > 1 ? selectedMenu() : trackMenuItems(song)
                    }
                    onPlay={() => playAt(position)}
                    artwork
                    showAlbum
                    showAdded
                    addedAt={track.addedAt}
                    selected={selection.isSelected(track.id)}
                    onSelectClick={(event) => selection.click(event, track.id)}
                    onContextSelect={() => selection.contextSelect(track.id)}
                    rowProps={sortable.bind(keys[position])}
                  />
                );
              })}
            </ol>
            {visible.length === 0 && <p className="py-10 text-center text-meta text-ink-2">No songs match this filter.</p>}
          </>
        )}
      </div>
    </div>
  );
}
