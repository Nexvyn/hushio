import { PlayRound } from "../components/PlayRound";
import { Folder, FolderSimpleMinus, Playlist, Plus, Shuffle } from "@phosphor-icons/react";
import { ActionMenu } from "../components/ActionMenu";
import { Button } from "../components/Button";
import { GHOST_ICON, SHUFFLE_PILL } from "../components/BrowseHero";
import { CollectionHero } from "../components/CollectionHero";
import { CoverStack, STACK_GRID } from "../components/CoverStack";
import { EmptyState } from "../components/EmptyState";
import { HeroIcon } from "../components/HeroIcon";
import { Icon } from "../components/Icon";
import { PHONE_ICON, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { coversOf, pinnedFirst, playlistsIn } from "../lib/collections";
import { playlistCovers } from "../lib/playlistCover";
import { useFailedCovers } from "../stores/coverErrors";
import { folderMenuItems, playCollection, playlistMenuItems } from "../lib/collectionActions";
import { fmtTotal } from "../lib/format";
import { plural } from "../lib/plural";
import { usePhone } from "../lib/usePhone";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";

export function FolderView() {
  const id = useNavigation((state) => state.view.param);
  const folder = useLibrary((state) => state.folders.find((item) => item.id === id));
  const folders = useLibrary((state) => state.folders);
  const playlists = useLibrary((state) => state.playlists);
  const setPlaylistFolder = useLibrary((state) => state.setPlaylistFolder);
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const failed = useFailedCovers();

  if (!folder) {
    return (
      <EmptyState
        icon={FolderSimpleMinus}
        title="This folder isn't here anymore"
        message="It was deleted, here or on another device. Its playlists are back in Your Library."
        action={{ label: "Open Your Library", onClick: () => navigate({ name: "library" }) }}
      />
    );
  }

  const inside = playlistsIn(playlists, folder.id);
  const others = playlists.filter((playlist) => playlist.folderId !== folder.id);
  const tracks = inside.flatMap((playlist) => playlist.tracks);
  const empty = tracks.length === 0;
  const total = tracks.reduce((sum, track) => sum + track.duration, 0);
  const facts = [
    plural(inside.length, "playlist", "playlists"),
    ...(empty ? [] : [plural(tracks.length, "song", "songs")]),
    ...(total > 0 ? [fmtTotal(total)] : []),
  ].join(" · ");
  const folderName = (folderId: string | null) => folders.find((item) => item.id === folderId)?.name ?? null;

  return (
    <div className="pb-16">
      <CollectionHero
        title={folder.name}
        covers={coversOf(tracks)}
        facts={facts}
        icon={Folder}
      >
        <PlayRound phone={phone} aria-label={`Play ${folder.name}`} disabled={empty} onClick={() => playCollection(tracks, folder.id, false)} />
        <button
          type="button"
          aria-label="Shuffle"
          title="Shuffle"
          disabled={empty}
          onClick={() => playCollection(tracks, folder.id, true)}
          className={phone ? PHONE_SHUFFLE : SHUFFLE_PILL}
        >
          <HeroIcon icon={Shuffle} />
          {phone && "Shuffle"}
        </button>
        <ActionMenu items={folderMenuItems(folder.id)} label="Folder options" triggerClass={phone ? PHONE_ICON : GHOST_ICON} />
      </CollectionHero>

      {inside.length > 0 ? (
        <section aria-label={`Playlists in ${folder.name}`} className="mt-8">
          <div className={STACK_GRID}>
            {pinnedFirst(inside, (playlist) => playlist.pinned).map((playlist) => (
              <CoverStack
                key={playlist.id}
                title={playlist.name}
                subtitle={`Playlist · ${plural(playlist.tracks.length, "song", "songs")}`}
                covers={playlistCovers(playlist, 3, failed)}
                fallback={Playlist}
                onOpen={() => navigate({ name: "playlist", param: playlist.id })}
                menu={playlistMenuItems(playlist)}
              />
            ))}
          </div>
        </section>
      ) : phone ? (
        <EmptyState title="Nothing in here yet" message={others.length > 0 ? "Add your playlists below." : "Make a playlist first."} />
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-separator px-6 py-12 text-center">
          <h2 className="text-card-title font-semibold text-ink-1">Nothing in here yet</h2>
          <p className="mt-1 text-body text-ink-2">
            {others.length > 0 ? "Add your playlists below." : "Make a playlist first."}
          </p>
        </div>
      )}

      {others.length > 0 && (
        <section aria-label={`Add to ${folder.name}`} className={phone ? "mt-7" : "mt-12"}>
          <h2 className={phone ? "font-title text-card-title font-bold leading-[26px] tracking-[-0.02em] text-ink-1" : "text-card-title font-bold text-ink-1"}>
            Add playlists
          </h2>
          <p className={phone ? "mb-3 text-meta leading-[17px] text-ink-2" : "mt-1 text-meta text-ink-2"}>
            {inside.length > 0 ? "More of yours to keep in this folder." : "Pick the playlists this folder keeps."}
          </p>
          <ul
            className={
              phone
                ? "grid grid-cols-1"
                : "mt-4 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-1"
            }
          >
            {others.map((playlist) => {
              const elsewhere = folderName(playlist.folderId);
              const art = playlistCovers(playlist, 1, failed)[0];
              return (
                <li key={playlist.id} className={phone ? "flex h-14 items-center gap-3" : "flex items-center gap-3.5 rounded-xl px-3 py-2.5 motion-safe:transition-colors [@media(hover:hover)]:hover:bg-wash"}>
                  <span className={`grid shrink-0 place-items-center overflow-hidden bg-wash text-ink-2 ${phone ? "h-12 w-12 rounded-[6px]" : "h-11 w-11 rounded-md"}`}>
                    {art ? <img loading="lazy" decoding="async" src={art} alt="" className="h-full w-full object-cover" /> : <Icon icon={Playlist} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={phone ? "block truncate text-body leading-[22px] text-ink-1" : "block truncate text-body font-semibold text-ink-1"}>{playlist.name}</span>
                    <span className={phone ? "block truncate text-meta leading-[18px] text-ink-2" : "block truncate text-meta text-ink-2"}>
                      {elsewhere ? `In "${elsewhere}"` : plural(playlist.tracks.length, "song", "songs")}
                    </span>
                  </span>
                  {phone ? (
                    <button
                      type="button"
                      aria-label={`Add ${playlist.name} to ${folder.name}`}
                      onClick={() => setPlaylistFolder(playlist.id, folder.id)}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] [corner-shape:squircle] bg-wash px-4 text-body font-medium text-ink-1 hover:bg-hover motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <Icon icon={Plus} />
                      Add
                    </button>
                  ) : (
                    <Button
                      aria-label={`Add ${playlist.name} to ${folder.name}`}
                      onClick={() => setPlaylistFolder(playlist.id, folder.id)}
                      className="gap-1.5"
                    >
                      <Icon icon={Plus} />
                      Add
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
