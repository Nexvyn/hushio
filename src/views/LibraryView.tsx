import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Clock01Icon,
  Copy01Icon,
  Download01Icon,
  Folder01Icon,
  FavouriteIcon,
  FireIcon,
  HardDriveIcon,
  HourglassIcon,
  ListMusicIcon,
  MagicWand01Icon,
  MoreHorizontalIcon,
  PlayListIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { ActionMenu } from "../components/ActionMenu";
import { openMenuAtPointer } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { PhoneIcon } from "../components/phone/PhoneIcon";
import { PhoneCollage, PhoneLibraryCard, PhoneLibraryRow } from "../components/phone/PhoneLibraryRows";
import { PhoneSectionHeader, PhoneShelfRow } from "../components/phone/PhoneShelf";
import { CollectionHero } from "../components/CollectionHero";
import { PageHeader } from "../components/PageHeader";
import { PhoneHeader } from "../components/phone/PhoneHeader";
import { PhoneProfileButton } from "../components/phone/PhoneProfileButton";
import { PHONE_HEADER_ICON } from "../components/phone/heroButtons";
import { SectionHeader } from "../components/SectionHeader";
import { CoverStack, STACK_GRID } from "../components/CoverStack";
import { EmptyState } from "../components/EmptyState";
import { PILL, ROUND } from "../components/BrowseHero";
import { coversOf, pinnedFirst, playlistsIn, unfiledPlaylists } from "../lib/collections";
import { distinctCovers } from "../lib/heroCovers";
import {
  createMenuItems,
  folderMenuItems,
  openCreatePlaylist,
  pinnedSingleMenuItems,
  playlistMenuItems,
} from "../lib/collectionActions";
import { plural } from "../lib/plural";
import type { SmartId } from "../lib/smartLists";
import { type Point } from "../lib/touchGesture";
import { usePhone } from "../lib/usePhone";
import { useSmartLists } from "../lib/useSmartLists";
import { type PinnedSingles, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useRecentItems } from "../stores/recents";
import { type MenuItem, useUI } from "../stores/ui";

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
  const phone = usePhone();
  const cover = collection.covers[0];
  const subtitle = [collection.pinned ? "Pinned" : "", collection.subtitle].filter(Boolean).join(" · ");
  const pin = collection.pin;
  const tile = phone
    ? "grid size-11 shrink-0 place-items-center overflow-hidden rounded-[10px] [corner-shape:squircle] bg-wash text-ink-1"
    : "grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-wash text-ink-1";
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
          : "flex h-14 w-full items-center gap-3 rounded-[10px] px-2 text-left transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      }
    >
      <span className={tile}>
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Icon icon={collection.fallback} />}
      </span>
      <span className="min-w-0 flex-1">
        {phone ? (
          <>
            <span className="block truncate text-[15px] font-medium leading-5 text-ink-1">{collection.title}</span>
            {subtitle && <span className="block truncate text-[13px] leading-[18px] tabular-nums text-ink-2">{subtitle}</span>}
          </>
        ) : (
          <>
            <span className="block truncate text-[14px] font-semibold text-ink-1">{collection.title}</span>
            {subtitle && <span className="block truncate text-[12.5px] tabular-nums text-ink-2">{subtitle}</span>}
          </>
        )}
      </span>
      {phone && (
        <span aria-hidden="true" className="shrink-0 text-ink-2">
          <Icon icon={ArrowRight01Icon} />
        </span>
      )}
    </button>
  );
}

const SMART_ICONS: Record<SmartId, IconSvgElement> = {
  "most-played": FireIcon,
  "recently-added": Clock01Icon,
  "not-played": HourglassIcon,
};

function openMenuAt(menu: () => MenuItem[]) {
  return (point: Point) => useUI.getState().openContextMenu(point.x, point.y, menu());
}

function Shelf({ label, children }: { label: string; children: ReactNode }) {
  const phone = usePhone();
  if (phone) {
    return (
      <section aria-label={label} className="mt-5">
        <h2 className="mb-3 font-title text-[20px] font-bold leading-[26px] tracking-[-0.02em] text-ink-1">{label}</h2>
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
  const liked = useLibrary((state) => state.liked);
  const playlists = useLibrary((state) => state.playlists);
  const folders = useLibrary((state) => state.folders);
  const pinnedSingles = useLibrary((state) => state.pinnedSingles);
  const downloads = useLibrary((state) => state.downloads);
  const recents = useRecentItems((state) => state.items);
  const navigate = useNavigation((state) => state.navigate);
  const smartLists = useSmartLists();
  const phone = usePhone();

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
  const actions = (
    <>
      <ActionMenu
        items={createMenuItems()}
        label="Create"
        triggerText={phone ? undefined : "Create"}
        icon={PlusSignIcon}
        triggerClass={phone ? undefined : PILL}
      />
      <ActionMenu
        items={[{ label: "Find duplicates", icon: Copy01Icon, onSelect: () => navigate({ name: "duplicates" }) }]}
        label="More options"
        icon={MoreHorizontalIcon}
        triggerClass={phone ? undefined : ROUND}
      />
    </>
  );
  const grid = phone ? "grid grid-cols-1" : "-mx-2 grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-1";

  if (phone) {
    const createItems = [
      ...createMenuItems(),
      { label: "Find duplicates", icon: Copy01Icon, onSelect: () => navigate({ name: "duplicates" }) },
    ];
    const unfiledSorted = pinnedFirst(unfiled, (playlist) => playlist.pinned);
    const phoneCollections = collections.filter((collection) => collection.key !== "playlists");
    const collectionSubtitle = (collection: Collection) => {
      if (collection.key !== "liked") return collection.subtitle;
      return liked.length > 0 ? plural(liked.length, "song", "songs") : "Songs you like land here";
    };
    return (
      <div className="pb-16">
        <PhoneHeader
          title="Library"
          actions={
            <>
              <ActionMenu items={createItems} label="Create" icon={PlusSignIcon} triggerClass={PHONE_HEADER_ICON} phoneIcon />
              <PhoneProfileButton />
            </>
          }
        />

        <ul>
          {phoneCollections.map((collection) => {
            const pin = collection.pin;
            const subtitle = [collection.pinned ? "Pinned" : "", collectionSubtitle(collection)].filter(Boolean).join(" · ");
            const art =
              collection.key === "liked" ? (
                <span className="grid size-[52px] shrink-0 place-items-center rounded-[8px] bg-accent text-on-accent [corner-shape:squircle]">
                  <PhoneIcon icon={FavouriteIcon} fill="currentColor" />
                </span>
              ) : (
                <PhoneCollage
                  covers={collection.covers}
                  fallback={collection.fallback}
                  sizeClass="size-[52px]"
                  radiusClass="rounded-[8px]"
                />
              );
            return (
              <li key={collection.key}>
                <PhoneLibraryRow
                  title={collection.title}
                  subtitle={subtitle}
                  art={art}
                  onOpen={collection.open}
                  onLongPress={pin ? openMenuAt(() => pinnedSingleMenuItems(pin, collection.pinned)) : undefined}
                />
              </li>
            );
          })}
        </ul>

        <section aria-label="Made for you" className="mt-7">
          <PhoneSectionHeader title="Made for you" />
          <PhoneShelfRow>
            {smartLists.map((list) => (
              <PhoneLibraryCard
                key={list.id}
                title={list.title}
                subtitle={list.tracks.length > 0 ? plural(list.tracks.length, "song", "songs") : "Nothing yet"}
                covers={distinctCovers([coversOf(list.tracks)], 4)}
                fallback={SMART_ICONS[list.id]}
                onOpen={() => navigate({ name: "smart", param: list.id })}
              />
            ))}
          </PhoneShelfRow>
        </section>

        <section aria-label="Playlists" className="mt-7">
          <PhoneSectionHeader title="Playlists" />
          {folders.length + unfiledSorted.length > 0 ? (
            <ul>
              {folders.map((folder) => {
                const inside = playlistsIn(playlists, folder.id);
                return (
                  <li key={folder.id}>
                    <PhoneLibraryRow
                      title={folder.name}
                      subtitle={`Folder · ${plural(inside.length, "playlist", "playlists")}`}
                      art={
                        <PhoneCollage
                          covers={distinctCovers([coversOf(inside.flatMap((playlist) => playlist.tracks))], 4)}
                          fallback={Folder01Icon}
                          sizeClass="size-[52px]"
                          radiusClass="rounded-[8px]"
                        />
                      }
                      onOpen={() => navigate({ name: "folder", param: folder.id })}
                      onLongPress={openMenuAt(() => folderMenuItems(folder.id))}
                    />
                  </li>
                );
              })}
              {unfiledSorted.map((playlist) => (
                <li key={playlist.id}>
                  <PhoneLibraryRow
                    title={playlist.name}
                    subtitle={[
                      playlist.pinned ? "Pinned" : "",
                      `Playlist · ${plural(playlist.tracks.length, "song", "songs")}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    art={
                      <PhoneCollage
                        covers={distinctCovers([coversOf(playlist.tracks)], 4)}
                        fallback={PlayListIcon}
                        sizeClass="size-[52px]"
                        radiusClass="rounded-[8px]"
                      />
                    }
                    onOpen={() => navigate({ name: "playlist", param: playlist.id })}
                    onLongPress={openMenuAt(() => playlistMenuItems(playlist))}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              <li>
                <PhoneLibraryRow
                  title="New playlist"
                  subtitle="Start one with songs you like"
                  art={
                    <PhoneCollage covers={[]} fallback={PlusSignIcon} sizeClass="size-[52px]" radiusClass="rounded-[8px]" />
                  }
                  onOpen={openCreatePlaylist}
                />
              </li>
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="pb-16">
      {phone ? (
        <PageHeader title="Library" meta={facts} actions={actions} />
      ) : (
        <CollectionHero title="Your Library" covers={heroCovers} facts={facts}>
          {actions}
        </CollectionHero>
      )}

      <Shelf label="Collections">
        <ul className={grid}>
          {collections.map((collection) => (
            <li key={collection.key}>
              <CollectionRow collection={collection} />
            </li>
          ))}
        </ul>
      </Shelf>

      <Shelf label="Made for you">
        <ul className={grid}>
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
