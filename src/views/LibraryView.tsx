import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Copy01Icon,
  Download01Icon,
  Folder01Icon,
  FavouriteIcon,
  HardDriveIcon,
  ListMusicIcon,
  MagicWand01Icon,
  MoreHorizontalIcon,
  PlayListIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { ActionMenu } from "../components/ActionMenu";
import { openMenuAtPointer } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { CollectionHero } from "../components/CollectionHero";
import { SectionHeader } from "../components/SectionHeader";
import { CoverStack, STACK_GRID } from "../components/CoverStack";
import { EmptyState } from "../components/EmptyState";
import { PILL, ROUND } from "../components/BrowseHero";
import { coversOf, pinnedFirst, playlistsIn, unfiledPlaylists } from "../lib/collections";
import { distinctCovers } from "../lib/heroCovers";
import {
  createMenuItems,
  folderMenuItems,
  pinnedSingleMenuItems,
  playlistMenuItems,
} from "../lib/collectionActions";
import { plural } from "../lib/plural";
import { useSmartLists } from "../lib/useSmartLists";
import { type PinnedSingles, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useRecentItems } from "../stores/recents";

type Collection = {
  key: string;
  pin?: keyof PinnedSingles;
  title: string;
  subtitle: string;
  covers: string[];
  fallback: IconSvgElement;
  pinned: boolean;
  open: () => void;
};

function CollectionRow({ collection }: { collection: Collection }) {
  const cover = collection.covers[0];
  const subtitle = [collection.pinned ? "Pinned" : "", collection.subtitle].filter(Boolean).join(" · ");
  const pin = collection.pin;
  return (
    <button
      type="button"
      onClick={collection.open}
      onContextMenu={
        pin ? (event) => openMenuAtPointer(event, () => pinnedSingleMenuItems(pin, collection.pinned)) : undefined
      }
      className="flex h-14 w-full items-center gap-3 rounded-[10px] px-2 text-left transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-wash text-ink-1">
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Icon icon={collection.fallback} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-ink-1">{collection.title}</span>
        {subtitle && <span className="block truncate text-[12.5px] tabular-nums text-ink-2">{subtitle}</span>}
      </span>
    </button>
  );
}

function Shelf({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="mt-7">
      <SectionHeader title={label} />
      {children}
    </section>
  );
}

export function LibraryView() {
  const liked = useLibrary((state) => state.liked);
  const playlists = useLibrary((state) => state.playlists);
  const folders = useLibrary((state) => state.folders);
  const pinnedSingles = useLibrary((state) => state.pinnedSingles);
  const downloads = useLibrary((state) => state.downloads);
  const recents = useRecentItems((state) => state.items);
  const navigate = useNavigation((state) => state.navigate);
  const smartLists = useSmartLists();

  const unfiled = unfiledPlaylists(playlists);
  const saved = Object.values(downloads).filter((item) => item.status === "done");
  const collections = pinnedFirst<Collection>(
    [
      {
        key: "liked",
        pin: "liked",
        title: "Liked Songs",
        subtitle: "",
        covers: coversOf(liked, 3),
        fallback: FavouriteIcon,
        pinned: pinnedSingles.liked,
        open: () => navigate({ name: "library", param: "liked" }),
      },
      {
        key: "downloads",
        pin: "downloads",
        title: "Downloads",
        subtitle: saved.length > 0 ? plural(saved.length, "song", "songs") : "Nothing saved yet",
        covers: coversOf(saved.map((item) => item.track), 3),
        fallback: Download01Icon,
        pinned: pinnedSingles.downloads,
        open: () => navigate({ name: "downloads" }),
      },
      {
        key: "local",
        pin: "local",
        title: "Local Music",
        subtitle: "On this device",
        covers: [],
        fallback: HardDriveIcon,
        pinned: pinnedSingles.local,
        open: () => navigate({ name: "local" }),
      },
      {
        key: "playlists",
        title: "Playlists",
        subtitle: "",
        covers: [],
        fallback: PlayListIcon,
        pinned: false,
        open: () => navigate({ name: "playlists" }),
      },
    ],
    (collection) => collection.pinned,
  );

  const madeForYou: Collection[] = smartLists.map((list) => ({
    key: `smart:${list.id}`,
    title: list.title,
    subtitle: list.tracks.length > 0 ? plural(list.tracks.length, "song", "songs") : "Nothing yet",
    covers: [],
    fallback: MagicWand01Icon,
    pinned: false,
    open: () => navigate({ name: "smart", param: list.id }),
  }));

  const heroCovers = distinctCovers([
    coversOf(liked),
    ...playlists.map((playlist) => coversOf(playlist.tracks)),
    coversOf(recents),
  ]);
  const facts = [
    plural(playlists.length, "playlist", "playlists"),
    plural(folders.length, "folder", "folders"),
    plural(liked.length, "liked song", "liked songs"),
  ].join(" · ");

  return (
    <div className="pb-16">
      <CollectionHero title="Your Library" covers={heroCovers} facts={facts}>
        <ActionMenu
          items={createMenuItems()}
          label="Create"
          triggerText="Create"
          icon={PlusSignIcon}
          triggerClass={PILL}
        />
        <ActionMenu
          items={[{ label: "Find duplicates", icon: Copy01Icon, onSelect: () => navigate({ name: "duplicates" }) }]}
          label="More options"
          icon={MoreHorizontalIcon}
          triggerClass={ROUND}
        />
      </CollectionHero>

      <Shelf label="Collections">
        <ul className="-mx-2 grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-1">
          {collections.map((collection) => (
            <li key={collection.key}>
              <CollectionRow collection={collection} />
            </li>
          ))}
        </ul>
      </Shelf>

      <Shelf label="Made for you">
        <ul className="-mx-2 grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-1">
          {madeForYou.map((collection) => (
            <li key={collection.key}>
              <CollectionRow collection={collection} />
            </li>
          ))}
        </ul>
      </Shelf>

      {folders.length > 0 && (
        <Shelf label="Folders">
          <div className={STACK_GRID}>
            {folders.map((folder) => {
              const inside = playlistsIn(playlists, folder.id);
              return (
                <CoverStack
                  key={folder.id}
                  title={folder.name}
                  subtitle={`Folder · ${plural(inside.length, "playlist", "playlists")}`}
                  covers={coversOf(inside.flatMap((playlist) => playlist.tracks), 3)}
                  fallback={Folder01Icon}
                  onOpen={() => navigate({ name: "folder", param: folder.id })}
                  menu={folderMenuItems(folder.id)}
                />
              );
            })}
          </div>
        </Shelf>
      )}

      <Shelf label="Playlists">
        {unfiled.length > 0 ? (
          <div className={STACK_GRID}>
            {pinnedFirst(unfiled, (playlist) => playlist.pinned).map((playlist) => (
              <CoverStack
                key={playlist.id}
                title={playlist.name}
                subtitle={`Playlist · ${plural(playlist.tracks.length, "song", "songs")}`}
                covers={coversOf(playlist.tracks, 3)}
                fallback={PlayListIcon}
                onOpen={() => navigate({ name: "playlist", param: playlist.id })}
                menu={playlistMenuItems(playlist)}
              />
            ))}
          </div>
        ) : folders.length > 0 ? (
          <p className="text-[14px] text-ink-2">All your playlists are in folders.</p>
        ) : (
          <EmptyState
            icon={ListMusicIcon}
            title="No playlists yet"
            message='Use Create above to make a playlist or a folder, or right-click any song and choose "New playlist" to start one from a song you like.'
          />
        )}
      </Shelf>
    </div>
  );
}
