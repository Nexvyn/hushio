import { t, useT } from "../lib/i18n";
import type { ReactNode } from "react";
import { ArrowSquareIn, CaretRight, ClockCounterClockwise, DownloadSimple, Folder, Heart, HardDrive, Queue, Playlist, Plus, VinylRecord, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { ActionMenu } from "../components/ActionMenu";
import { openMenuAtPointer } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { PhoneIcon } from "../components/phone/PhoneIcon";
import { PhoneCollage, PhoneLibraryRow } from "../components/phone/PhoneLibraryRows";
import { PhoneSectionHeader } from "../components/phone/PhoneShelf";
import { CollectionHero } from "../components/CollectionHero";
import { PhoneHeader } from "../components/phone/PhoneHeader";
import { PhoneProfileButton } from "../components/phone/PhoneProfileButton";
import { SectionHeader } from "../components/SectionHeader";
import { CoverStack, STACK_GRID } from "../components/CoverStack";
import { EmptyState } from "../components/EmptyState";
import { PILL } from "../components/BrowseHero";
import { coversOf, pinnedFirst, playlistsIn, unfiledPlaylists } from "../lib/collections";
import { deviceTracks } from "../lib/localLibrary";
import { playlistCovers } from "../lib/playlistCover";
import { browseMenuItems } from "../lib/browseActions";
import { distinctCovers } from "../lib/heroCovers";
import {
  createMenuItems,
  folderMenuItems,
  openCreatePlaylist,
  pinnedSingleMenuItems,
  playlistMenuItems,
} from "../lib/collectionActions";
import { plural } from "../lib/plural";
import { type Point } from "../lib/touchGesture";
import { usePhone } from "../lib/usePhone";
import { type PinnedSingles, type SavedAlbum, useLibrary } from "../stores/library";
import { useFailedCovers } from "../stores/coverErrors";
import { useNavigation } from "../stores/navigation";
import { useLocalLibrary } from "../stores/localLibrary";
import { useRecentItems } from "../stores/recents";
import { type MenuItem, useUI } from "../stores/ui";

type Collection = {
  key: string;
  pin?: keyof PinnedSingles;
  title: string;
  subtitle: string;
  covers: string[];
  fallback: PhosphorIcon;
  pinned: boolean;
  open: () => void;
};

type PhoneEntry = {
  key: string;
  title: string;
  subtitle: string;
  covers: string[];
  fallback: PhosphorIcon;
  heart?: boolean;
  open: () => void;
  menu?: (point: Point) => void;
};

function CollectionRow({ collection }: { collection: Collection }) {
  const phone = usePhone();
  const cover = collection.covers[0];
  const subtitle = [collection.pinned ? "Pinned" : "", collection.subtitle].filter(Boolean).join(" · ");
  const pin = collection.pin;
  const tile = phone
    ? "grid size-11 shrink-0 place-items-center overflow-hidden rounded-[10px] [corner-shape:squircle] bg-wash text-ink-1"
    : "grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[4px] bg-wash text-ink-1";
  return (
    <button
      type="button"
      onClick={collection.open}
      onContextMenu={
        pin ? (event) => openMenuAtPointer(event, () => pinnedSingleMenuItems(pin, collection.pinned)) : undefined
      }
      className={
        phone
          ? "flex h-14 w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          : "flex h-14 w-full items-center gap-3 rounded-[10px] pl-2 pr-2 text-left transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      }
    >
      <span className={tile}>
        {cover ? <img loading="lazy" decoding="async" src={cover} alt="" className="h-full w-full object-cover" /> : <Icon icon={collection.fallback} />}
      </span>
      <span className="min-w-0 flex-1">
        {phone ? (
          <>
            <span className="block truncate text-body font-medium leading-5 text-ink-1">{collection.title}</span>
            {subtitle && <span className="block truncate text-meta leading-[18px] tabular-nums text-ink-2">{subtitle}</span>}
          </>
        ) : (
          <>
            <span className="block truncate text-body font-medium text-ink-1">{collection.title}</span>
            {subtitle && <span className="block truncate text-meta tabular-nums text-ink-2">{subtitle}</span>}
          </>
        )}
      </span>
      {phone && (
        <span aria-hidden="true" className="shrink-0 text-ink-2">
          <Icon icon={CaretRight} />
        </span>
      )}
    </button>
  );
}

function openMenuAt(menu: () => MenuItem[]) {
  return (point: Point) => useUI.getState().openContextMenu(point.x, point.y, menu());
}

function savedAlbumMenu(album: SavedAlbum): MenuItem[] {
  return browseMenuItems({ type: "album", browseId: album.id, title: album.title, subtitle: album.artist, thumb: album.thumb ?? null });
}

function Shelf({ label, children }: { label: string; children: ReactNode }) {
  const phone = usePhone();
  if (phone) {
    return (
      <section aria-label={label} className="mt-5">
        <h2 className="mb-3 font-title text-card-title font-semibold leading-[26px] tracking-[-0.02em] text-ink-1">{label}</h2>
        {children}
      </section>
    );
  }
  return (
    <section aria-label={label} className="mt-7">
      <SectionHeader title={label} />
      {children}
    </section>
  );
}

export function LibraryView() {
  useT();
  const liked = useLibrary((state) => state.liked);
  const playlists = useLibrary((state) => state.playlists);
  const savedAlbums = useLibrary((state) => state.savedAlbums);
  const failed = useFailedCovers();
  const folders = useLibrary((state) => state.folders);
  const pinnedSingles = useLibrary((state) => state.pinnedSingles);
  const downloads = useLibrary((state) => state.downloads);
  const localTracks = useLocalLibrary((state) => state.library.tracks);
  const recents = useRecentItems((state) => state.items);
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();

  const unfiled = unfiledPlaylists(playlists);
  const saved = Object.values(downloads).filter((item) => item.status === "done");
  const onDevice = deviceTracks(localTracks, Object.values(downloads));
  const collections = pinnedFirst<Collection>(
    [
      {
        key: "liked",
        pin: "liked",
        title: t("nav.liked"),
        subtitle: "",
        covers: coversOf(liked, 3),
        fallback: Heart,
        pinned: pinnedSingles.liked,
        open: () => navigate({ name: "library", param: "liked" }),
      },
      {
        key: "downloads",
        pin: "downloads",
        title: t("nav.downloads"),
        subtitle: saved.length > 0 ? plural(saved.length, "song", "songs") : "Nothing saved yet",
        covers: coversOf(saved.map((item) => item.track), 3),
        fallback: DownloadSimple,
        pinned: pinnedSingles.downloads,
        open: () => navigate({ name: "downloads" }),
      },
      {
        key: "history",
        title: t("library.history"),
        subtitle: "Recently played",
        covers: [],
        fallback: ClockCounterClockwise,
        pinned: false,
        open: () => navigate({ name: "history" }),
      },
      {
        key: "local",
        pin: "local",
        title: t("nav.local"),
        subtitle: onDevice.length > 0 ? `${plural(onDevice.length, "song", "songs")} on this device` : "On this device",
        covers: [],
        fallback: HardDrive,
        pinned: pinnedSingles.local,
        open: () => navigate({ name: "local" }),
      },
      {
        key: "playlists",
        title: t("library.playlists"),
        subtitle: "",
        covers: [],
        fallback: Playlist,
        pinned: false,
        open: () => navigate({ name: "playlists" }),
      },
    ],
    (collection) => collection.pinned,
  );

  const heroCovers = distinctCovers([
    coversOf(liked),
    ...playlists.map((playlist) => playlistCovers(playlist, undefined, failed)),
    coversOf(recents),
  ]);
  const facts = [
    plural(playlists.length, "playlist", "playlists"),
    plural(folders.length, "folder", "folders"),
    plural(liked.length, "liked song", "liked songs"),
  ].join(" · ");
  const actions = (
    <>
      <ActionMenu
        items={createMenuItems()}
        label="Create"
        triggerText={phone ? undefined : "Create"}
        icon={Plus}
        triggerClass={phone ? undefined : PILL}
      />
    </>
  );
  const grid = phone ? "grid grid-cols-1" : "-mx-2 grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-1";

  if (phone) {
    const unfiledSorted = pinnedFirst(unfiled, (playlist) => playlist.pinned);
    const phoneCollections = collections.filter((collection) => collection.key !== "playlists");
    const phoneSubtitle = (collection: Collection) => {
      if (collection.key === "liked") return plural(liked.length, "song", "songs");
      if (collection.key === "downloads") return plural(saved.length, "song", "songs");
      if (collection.key === "history") return plural(recents.length, "recent item", "recent items");
      if (collection.key === "local") return `${plural(onDevice.length, "song", "songs")} on this device`;
      return collection.subtitle;
    };
    const collectionEntries: PhoneEntry[] = phoneCollections.map((collection) => {
      const pin = collection.pin;
      return {
        key: collection.key,
        title: collection.title,
        subtitle: phoneSubtitle(collection),
        covers: collection.covers,
        fallback: collection.fallback,
        heart: collection.key === "liked",
        open: collection.open,
        menu: pin ? openMenuAt(() => pinnedSingleMenuItems(pin, collection.pinned)) : undefined,
      };
    });
    const importEntry: PhoneEntry = {
      key: "import",
      title: t("nav.import"),
      subtitle: t("library.importFromApps"),
      covers: [],
      fallback: ArrowSquareIn,
      open: () => navigate({ name: "import" }),
    };
    const playlistEntries: PhoneEntry[] = [
      ...folders.map((folder) => {
        const inside = playlistsIn(playlists, folder.id);
        return {
          key: `folder:${folder.id}`,
          title: folder.name,
          subtitle: `Folder · ${plural(inside.length, "playlist", "playlists")}`,
          covers: distinctCovers([coversOf(inside.flatMap((playlist) => playlist.tracks))], 4),
          fallback: Folder,
          open: () => navigate({ name: "folder", param: folder.id }),
          menu: openMenuAt(() => folderMenuItems(folder.id)),
        };
      }),
      ...unfiledSorted.map((playlist) => ({
        key: `playlist:${playlist.id}`,
        title: playlist.name,
        subtitle: `Playlist · ${plural(playlist.tracks.length, "song", "songs")}`,
        covers: distinctCovers([playlistCovers(playlist, undefined, failed)], 4),
        fallback: Playlist,
        open: () => navigate({ name: "playlist", param: playlist.id }),
        menu: openMenuAt(() => playlistMenuItems(playlist)),
      })),
      {
        key: "new-playlist",
        title: t("library.newPlaylist"),
        subtitle: t("library.startOne"),
        covers: [],
        fallback: Plus,
        open: openCreatePlaylist,
      },
    ];

    const renderListRow = (entry: PhoneEntry) => (
      <li key={entry.key}>
        <PhoneLibraryRow
          title={entry.title}
          subtitle={entry.subtitle}
          art={
            entry.heart ? (
              <span className="grid size-12 shrink-0 place-items-center text-ink-2">
                <PhoneIcon icon={Heart} />
              </span>
            ) : (
              <PhoneCollage covers={entry.covers} fallback={entry.fallback} sizeClass="size-12" radiusClass="rounded-[8px]" />
            )
          }
          onOpen={entry.open}
          onLongPress={entry.menu}
        />
      </li>
    );

    const renderEntries = (entries: PhoneEntry[]) => <ul>{entries.map(renderListRow)}</ul>;

    return (
      <div>
        <PhoneHeader
          title={t("library.title")}
          actions={<PhoneProfileButton />}
        />

        {renderEntries([...collectionEntries, importEntry])}

        <section aria-label="Playlists" className="mt-7">
          <PhoneSectionHeader title={t("library.playlists")} />
          {renderEntries(playlistEntries)}
        </section>
        {savedAlbums.length > 0 && (
          <section aria-label="Albums" className="mt-7">
            <PhoneSectionHeader title={t("library.albums")} />
            <ul>
              {savedAlbums.map((album) => (
                <li key={album.id}>
                  <PhoneLibraryRow
                    title={album.title}
                    subtitle={album.artist}
                    art={<PhoneCollage covers={coversOf([album], 1)} fallback={VinylRecord} sizeClass="size-12" radiusClass="rounded-[8px]" />}
                    onOpen={() => navigate({ name: "album", param: album.id })}
                    onLongPress={openMenuAt(() => savedAlbumMenu(album))}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="pb-16">
      <CollectionHero title={t("nav.library")} covers={heroCovers} facts={facts}>
        {actions}
      </CollectionHero>

      <Shelf label="Collections">
        <ul className={grid}>
          {collections.map((collection) => (
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
                  fallback={Folder}
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
                covers={playlistCovers(playlist, 3, failed)}
                fallback={Playlist}
                onOpen={() => navigate({ name: "playlist", param: playlist.id })}
                menu={playlistMenuItems(playlist)}
              />
            ))}
          </div>
        ) : folders.length > 0 ? (
          <p className="text-body text-ink-2">All your playlists are in folders.</p>
        ) : (
          <EmptyState
            icon={Queue}
            title={t("library.noPlaylists")}
            message='Use Create above to make a playlist or a folder, or right-click any song and choose "New playlist" to start one from a song you like.'
          />
        )}
      </Shelf>
      {savedAlbums.length > 0 && (
        <Shelf label="Albums">
          <div className={STACK_GRID}>
            {savedAlbums.map((album) => (
              <CoverStack
                key={album.id}
                title={album.title}
                subtitle={`Album · ${album.artist}`}
                covers={coversOf([album], 3)}
                fallback={VinylRecord}
                onOpen={() => navigate({ name: "album", param: album.id })}
                menu={savedAlbumMenu(album)}
              />
            ))}
          </div>
        </Shelf>
      )}
    </div>
  );
}
