import { Folder01Icon, FolderRemoveIcon, PlayIcon, PlayListIcon, PlusSignIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "../components/ActionMenu";
import { Button } from "../components/Button";
import { PILL, ROUND } from "../components/BrowseHero";
import { CollectionHero } from "../components/CollectionHero";
import { CoverStack, STACK_GRID } from "../components/CoverStack";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { coversOf, pinnedFirst, playlistsIn } from "../lib/collections";
import { folderMenuItems, playCollection, playlistMenuItems } from "../lib/collectionActions";
import { fmtTotal } from "../lib/format";
import { plural } from "../lib/plural";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";

export function FolderView() {
  const id = useNavigation((state) => state.view.param);
  const folder = useLibrary((state) => state.folders.find((item) => item.id === id));
  const folders = useLibrary((state) => state.folders);
  const playlists = useLibrary((state) => state.playlists);
  const setPlaylistFolder = useLibrary((state) => state.setPlaylistFolder);
  const navigate = useNavigation((state) => state.navigate);

  if (!folder) {
    return (
      <EmptyState
        icon={FolderRemoveIcon}
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
    ...(empty ? [] : [plural(tracks.length, "song", "songs"), fmtTotal(total)]),
  ].join(" · ");
  const folderName = (folderId: string | null) => folders.find((item) => item.id === folderId)?.name ?? null;

  return (
    <div className="pb-16">
      <CollectionHero
        icon={Folder01Icon}
        kind="Folder"
        title={folder.name}
        covers={coversOf(tracks)}
        facts={facts}
      >
        <button
          type="button"
          aria-label={`Play ${folder.name}`}
          disabled={empty}
          onClick={() => playCollection(tracks, folder.id, false)}
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
          onClick={() => playCollection(tracks, folder.id, true)}
          className={ROUND}
        >
          <Icon icon={ShuffleIcon} />
        </button>
        <ActionMenu items={folderMenuItems(folder.id)} label="Folder options" triggerClass={ROUND} />
      </CollectionHero>

      {inside.length > 0 ? (
        <section aria-label={`Playlists in ${folder.name}`} className="mt-8">
          <div className={STACK_GRID}>
            {pinnedFirst(inside, (playlist) => playlist.pinned).map((playlist) => (
              <CoverStack
                key={playlist.id}
                title={playlist.name}
                subtitle={`Playlist · ${plural(playlist.tracks.length, "song", "songs")}`}
                covers={coversOf(playlist.tracks, 3)}
                fallback={PlayListIcon}
                onOpen={() => navigate({ name: "playlist", param: playlist.id })}
                menu={playlistMenuItems(playlist.id, playlist.pinned)}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-separator px-6 py-12 text-center">
          <h2 className="text-[17px] font-semibold text-ink-1">Nothing in here yet</h2>
          <p className="mt-1 text-[14px] text-ink-2">
            {others.length > 0 ? "Add your playlists below." : "Make a playlist first."}
          </p>
        </div>
      )}

      {others.length > 0 && (
        <section aria-label={`Add to ${folder.name}`} className="mt-12">
          <h2 className="text-[19px] font-bold text-ink-1">Add playlists</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {inside.length > 0 ? "More of yours to keep in this folder." : "Pick the playlists this folder keeps."}
          </p>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-1">
            {others.map((playlist) => {
              const elsewhere = folderName(playlist.folderId);
              const art = coversOf(playlist.tracks, 1)[0];
              return (
                <li key={playlist.id} className="flex items-center gap-3.5 rounded-xl px-3 py-2.5 motion-safe:transition-colors [@media(hover:hover)]:hover:bg-wash">
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-wash text-ink-2">
                    {art ? <img src={art} alt="" className="h-full w-full object-cover" /> : <Icon icon={PlayListIcon} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink-1">{playlist.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-2">
                      {elsewhere ? `In "${elsewhere}"` : plural(playlist.tracks.length, "song", "songs")}
                    </span>
                  </span>
                  <Button
                    aria-label={`Add ${playlist.name} to ${folder.name}`}
                    onClick={() => setPlaylistFolder(playlist.id, folder.id)}
                    className="gap-1.5"
                  >
                    <Icon icon={PlusSignIcon} />
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
