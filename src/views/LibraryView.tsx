import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Download01Icon,
  Folder01Icon,
  FavouriteIcon,
  HardDriveIcon,
  LibraryIcon,
  ListMusicIcon,
  PlayListIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { ActionMenu } from "../components/ActionMenu";
import { CollectionHero } from "../components/CollectionHero";
import { CoverStack, STACK_GRID } from "../components/CoverStack";
import { EmptyState } from "../components/EmptyState";
import { PILL } from "../components/BrowseHero";
import { coversOf, pinnedFirst, playlistsIn, unfiledPlaylists } from "../lib/collections";
import {
  createMenuItems,
  folderMenuItems,
  pinnedSingleMenuItems,
  playCollection,
  playlistMenuItems,
} from "../lib/collectionActions";
import { plural } from "../lib/plural";
import { type PinnedSingles, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";

type Collection = {
  key: string;
  pin: keyof PinnedSingles;
  title: string;
  subtitle: string;
  covers: string[];
  fallback: IconSvgElement;
  pinned: boolean;
  open: () => void;
  play?: () => void;
};

function Shelf({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="mt-11">
      <h2 className="mb-4 text-[19px] font-bold text-ink-1">{label}</h2>
      {children}
    </section>
  );
}

export function LibraryView() {
  const liked = useLibrary((state) => state.liked);
  const playlists = useLibrary((state) => state.playlists);
  const folders = useLibrary((state) => state.folders);
  const pinnedSingles = useLibrary((state) => state.pinnedSingles);
  const navigate = useNavigation((state) => state.navigate);

  const unfiled = unfiledPlaylists(playlists);
  const collections = pinnedFirst<Collection>(
    [
      {
        key: "liked",
        pin: "liked",
        title: "Liked Songs",
        subtitle: plural(liked.length, "song", "songs"),
        covers: coversOf(liked, 3),
        fallback: FavouriteIcon,
        pinned: pinnedSingles.liked,
        open: () => navigate({ name: "library", param: "liked" }),
        play: liked.length > 0 ? () => playCollection(liked, "__liked__", false) : undefined,
      },
      {
        key: "downloads",
        pin: "downloads",
        title: "Downloads",
        subtitle: plural(0, "song", "songs"),
        covers: [],
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
    ],
    (collection) => collection.pinned,
  );

  const heroCovers = [...coversOf(liked), ...playlists.flatMap((playlist) => coversOf(playlist.tracks))];
  const facts = [
    plural(playlists.length, "playlist", "playlists"),
    plural(folders.length, "folder", "folders"),
    plural(liked.length, "liked song", "liked songs"),
  ].join(" · ");

  return (
    <div className="pb-16">
      <CollectionHero icon={LibraryIcon} kind="Everything you keep" title="Your Library" covers={heroCovers} facts={facts}>
        <ActionMenu
          items={createMenuItems()}
          label="Create"
          triggerText="Create"
          icon={PlusSignIcon}
          triggerClass={PILL}
        />
      </CollectionHero>

      <Shelf label="Collections">
        <div className={STACK_GRID}>
          {collections.map((collection) => (
            <CoverStack
              key={collection.key}
              title={collection.title}
              subtitle={collection.pinned ? `Pinned · ${collection.subtitle}` : collection.subtitle}
              covers={collection.covers}
              fallback={collection.fallback}
              onOpen={collection.open}
              onPlay={collection.play}
              menu={() => pinnedSingleMenuItems(collection.pin, collection.pinned)}
            />
          ))}
        </div>
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
