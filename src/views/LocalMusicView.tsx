import { useEffect, useState } from "react";
import {
  ArrowLeft01Icon,
  Alert01Icon,
  Cancel01Icon,
  CloudServerIcon,
  Delete02Icon,
  FileMusicIcon,
  FolderAddIcon,
  FolderOpenIcon,
  MusicNote01Icon,
  PencilEdit02Icon,
  PlayIcon,
  PlayListIcon,
  RefreshIcon,
  Search01Icon,
  ShuffleIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import type { LocalFolderEntry, LocalTrack, NetworkServer, NetworkTrack } from "../lib/bridge";
import { ActionMenu } from "../components/ActionMenu";
import { ROUND, PILL } from "../components/BrowseHero";
import { CollectionHero } from "../components/CollectionHero";
import { CoverStack, STACK_GRID } from "../components/CoverStack";
import { EmptyState } from "../components/EmptyState";
import { HeroIcon } from "../components/HeroIcon";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { PHONE_ICON, PHONE_PLAY, PHONE_SHUFFLE } from "../components/phone/heroButtons";
import { APP_NAME } from "../lib/app";
import { fmtTime, fmtTotal } from "../lib/format";
import {
  albumGroups,
  artistGroups,
  artUrl,
  childPath,
  folderListing,
  folderName,
  isUnderPath,
  leftOutText,
  scopeTracks,
  sortTracks,
  toTrack,
  type LocalScope,
  type LocalSort,
  type LocalTab,
} from "../lib/localLibrary";
import { OPENED_FROM } from "../lib/localDrop";
import { plural } from "../lib/plural";
import { usePhone } from "../lib/usePhone";
import { useLocalLibrary } from "../stores/localLibrary";
import { useNavigation } from "../stores/navigation";
import { useNetwork } from "../stores/network";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const ALL = "all";
const OPENED = "opened";
const FIELD =
  "h-9 w-56 rounded-full border border-white/10 bg-white/5 pl-9 pr-3 text-base md:text-[14px] text-ink-1 placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const TAB =
  "rounded-full px-3.5 py-1.5 text-[13.5px] font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left [@media(hover:hover)]:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const WARNING = "rounded-xl bg-amber-500/10 px-4 py-3 text-[14px] text-amber-300";
const CRUMB = "underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded";

type Filter = { kind: "album"; album: string; artist: string } | { kind: "artist"; artist: string } | null;

function scopeOf(param: string): LocalScope {
  if (param === ALL) return { kind: "all" };
  if (param === OPENED) return { kind: "opened" };
  return { kind: "folder", path: param };
}

function matchesFilter(track: LocalTrack, filter: Filter): boolean {
  if (!filter) return true;
  if (filter.kind === "artist") return track.artist === filter.artist;
  return track.album === filter.album && track.artist === filter.artist;
}

function uniqueArt(tracks: LocalTrack[], limit: number): string[] {
  const covers = new Set<string>();
  for (const track of tracks) {
    const url = artUrl(track.art);
    if (url) covers.add(url);
    if (covers.size >= limit) break;
  }
  return [...covers];
}

function scannedOn(scannedAt: number): string {
  return new Date(scannedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function topArtist(tracks: LocalTrack[]): string | null {
  const ranked = artistGroups(tracks).sort((a, b) => b.count - a.count);
  return ranked[0]?.artist ?? null;
}

function folderLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function playTracks(tracks: LocalTrack[], start: number, from: string) {
  usePlayer.getState().playQueue(tracks.map(toTrack), start, from);
}

function playNetworkTracks(tracks: Track[], start: number, from: string) {
  usePlayer.getState().playQueue(tracks, start, from);
}

function shuffleTracks(tracks: LocalTrack[], from: string) {
  const player = usePlayer.getState();
  if (!player.shuffle) player.toggleShuffle();
  playTracks(tracks, 0, from);
}

function shuffleNetworkTracks(tracks: Track[], from: string) {
  const player = usePlayer.getState();
  if (!player.shuffle) player.toggleShuffle();
  playNetworkTracks(tracks, 0, from);
}

function LocalTrackRow({ track, onPlay, onRemove }: { track: LocalTrack; onPlay: () => void; onRemove?: () => void }) {
  const phone = usePhone();
  return (
    <div className={phone ? "flex items-center gap-2" : "flex items-center gap-2"}>
      <button
        type="button"
        aria-label={`Play ${track.title}`}
        onClick={onPlay}
        className={phone ? "flex h-14 min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" : ROW}
      >
        <span className="min-w-0 flex-1">
          <span className={phone ? "block truncate text-[16px] leading-[22px] text-ink-1" : "block truncate text-[15px] text-ink-1"}>
            {track.title}
          </span>
          <span className={`block truncate ${phone ? "text-[13.5px] leading-[18px] text-ink-2" : "text-[13px] text-ink-3"}`}>
            {track.artist} · {track.album}
          </span>
        </span>
        {!phone && <span className="tabular-nums text-[13px] text-ink-3">{fmtTime(track.duration)}</span>}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${track.title} from Opened files`}
          title="Remove from Opened files"
          onClick={onRemove}
          className={phone ? `${ROUND} size-11 shrink-0` : `${ROUND} hit-area h-9 w-9 shrink-0`}
        >
          <Icon icon={Cancel01Icon} />
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <p className="flex items-center gap-2 text-[14px] text-ink-2" role="status">
      <span className="bt-spin">
        <Icon icon={RefreshIcon} />
      </span>
      Reading tags and artwork…
    </p>
  );
}

function FolderActions({ folder }: { folder: LocalFolderEntry }) {
  const rename = useLocalLibrary((state) => state.rename);
  const remove = useLocalLibrary((state) => state.remove);
  const openDialog = useUI((state) => state.openDialog);
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const label = folderName(folder);
  const renameFolder = () =>
    openDialog({
      title: `Rename "${label}"`,
      body: `This name is only used inside ${APP_NAME}. The folder on disk keeps its own name.`,
      initialValue: label,
      confirmLabel: "Rename",
      onConfirm: (value) => void rename(folder.path, value),
    });
  const removeFolder = () =>
    openDialog({
      title: `Remove "${label}"?`,
      body: `Removes the folder from ${APP_NAME} only. Your files stay exactly where they are on disk.`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => {
        void remove(folder.path);
        navigate({ name: "local" });
      },
    });
  if (phone) {
    return (
      <ActionMenu
        items={[
          { label: "Rename", icon: PencilEdit02Icon, onSelect: renameFolder },
          { label: "Remove", icon: Delete02Icon, danger: true, onSelect: removeFolder },
        ]}
        label="Folder options"
        triggerClass={PHONE_ICON}
      />
    );
  }
  return (
    <>
      <button
        type="button"
        className={ROUND}
        aria-label={`Rename ${label}`}
        title={`Rename in ${APP_NAME}`}
        onClick={renameFolder}
      >
        <Icon icon={PencilEdit02Icon} />
      </button>
      <button
        type="button"
        className={ROUND}
        aria-label={`Remove ${label}`}
        title={`Remove from ${APP_NAME}`}
        onClick={removeFolder}
      >
        <Icon icon={Delete02Icon} />
      </button>
    </>
  );
}

function IndexView({ onOpen }: { onOpen: (param: string) => void }) {
  const library = useLocalLibrary((state) => state.library);
  const opened = useLocalLibrary((state) => state.opened);
  const missing = useLocalLibrary((state) => state.missing);
  const scanning = useLocalLibrary((state) => state.scanning);
  const scan = useLocalLibrary((state) => state.scan);
  const importFolders = useLocalLibrary((state) => state.importFromPicker);
  const { folders, tracks } = library;
  const left = leftOutText(library.unplayable);
  const phone = usePhone();

  return (
    <div className="pb-14">
      <CollectionHero
        title="Local Music"
        icon={MusicNote01Icon}
        covers={uniqueArt(tracks, 8)}
        facts={
          <>
            <span>
              {plural(tracks.length, "song", "songs")} · {plural(folders.length, "folder", "folders")}
              {library.scannedAt > 0 && ` · Scanned ${scannedOn(library.scannedAt)}`}
            </span>
            {left && <span className={`mt-1 block text-[13px] ${phone ? "text-ink-2" : "text-white/55"}`}>{left}</span>}
          </>
        }
      >
        <button
          type="button"
          className={phone ? PHONE_PLAY : PILL}
          disabled={tracks.length === 0}
          onClick={() => playTracks(tracks, 0, "Local Music")}
        >
          <HeroIcon icon={PlayIcon} /> Play
        </button>
        <button
          type="button"
          className={phone ? PHONE_SHUFFLE : ROUND}
          aria-label="Shuffle"
          title="Shuffle"
          disabled={tracks.length === 0}
          onClick={() => shuffleTracks(tracks, "Local Music")}
        >
          <HeroIcon icon={ShuffleIcon} />
          {phone && "Shuffle"}
        </button>
        <button
          type="button"
          className={phone ? PHONE_ICON : ROUND}
          aria-label="Rescan every folder"
          title="Rescan every folder"
          disabled={scanning || folders.length === 0}
          onClick={() => void scan()}
        >
          <span className={scanning ? "bt-spin" : undefined}>
            <Icon icon={RefreshIcon} />
          </span>
        </button>
        <button
          type="button"
          className={phone ? PHONE_ICON : PILL}
          disabled={scanning}
          onClick={() => void importFolders()}
          aria-label={phone ? "Add folders" : undefined}
          title={phone ? "Add folders" : undefined}
        >
          <Icon icon={FolderAddIcon} />
          {phone ? null : " Add folders"}
        </button>
      </CollectionHero>
      {scanning && (
        <div className="mt-6">
          <Spinner />
        </div>
      )}
      <section aria-label="Your local music" className="mt-8">
        <div className={STACK_GRID}>
          {folders.length > 0 && (
            <CoverStack
              title="All songs"
              subtitle={`Everything imported · ${plural(tracks.length, "song", "songs")}`}
              covers={uniqueArt(tracks, 4)}
              fallback={PlayListIcon}
              onOpen={() => onOpen(ALL)}
              onPlay={() => playTracks(sortTracks(tracks, "title"), 0, "All songs")}
            />
          )}
          {folders.map((folder) => {
            const inside = tracks.filter((track) => isUnderPath(track.path, folder.path));
            return (
              <CoverStack
                key={folder.path}
                title={folderName(folder)}
                subtitle={
                  missing.includes(folder.path)
                    ? "Folder missing: check the drive, or remove it"
                    : plural(inside.length, "song", "songs")
                }
                covers={uniqueArt(inside, 4)}
                fallback={FolderOpenIcon}
                onOpen={() => onOpen(folder.path)}
                onPlay={() => playTracks(sortTracks(inside, "title"), 0, folderName(folder))}
              />
            );
          })}
          {opened.length > 0 && (
            <CoverStack
              title="Opened files"
              subtitle={`Opened with ${APP_NAME} · ${plural(opened.length, "song", "songs")}`}
              covers={uniqueArt(opened, 4)}
              fallback={FileMusicIcon}
              onOpen={() => onOpen(OPENED)}
              onPlay={() => playTracks(opened, 0, OPENED_FROM)}
            />
          )}
          <button
            type="button"
            onClick={() => void importFolders()}
            disabled={scanning}
            className="flex min-h-[120px] flex-col items-start justify-center gap-1 rounded-2xl border border-dashed border-white/15 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Icon icon={FolderAddIcon} />
            <span className="text-[15px] font-semibold text-ink-1">Import another folder</span>
            <span className="text-[13px] text-ink-3">Your files stay where they are</span>
          </button>
        </div>
      </section>
      <NetworkServers onOpen={onOpen} />
    </div>
  );
}

function NetworkServers({ onOpen }: { onOpen: (param: string) => void }) {
  const servers = useNetwork((state) => state.servers);
  const tracks = useNetwork((state) => state.tracks);
  const loadServers = useNetwork((state) => state.load);
  const loadTracks = useNetwork((state) => state.loadTracks);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  if (servers.length === 0) return null;

  const open = async (server: NetworkServer) => {
    setBusy(server.id);
    await loadTracks(server.id, server.path);
    setBusy(null);
    onOpen(`net:${server.id}`);
  };

  return (
    <section aria-label="Network servers" className="mt-8">
      <h2 className="mb-3 text-[15px] font-semibold text-ink-1">Network servers</h2>
      <div className={STACK_GRID}>
        {servers.map((server) => {
          const found = tracks[server.id] ?? [];
          return (
            <CoverStack
              key={server.id}
              title={server.name}
              subtitle={
                busy === server.id
                  ? "Reading the server…"
                  : found.length > 0
                    ? plural(found.length, "song", "songs")
                    : "Open to read the server"
              }
              covers={[]}
              fallback={CloudServerIcon}
              onOpen={() => void open(server)}
              onPlay={() => {
                if (found.length > 0) playNetworkTracks(networkTracksOf(found), 0, server.name);
                else void open(server);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

function networkTracksOf(tracks: NetworkTrack[]): Track[] {
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumb: null,
  }));
}

function FolderTab({
  root,
  tracks,
  at,
  onFolder,
}: {
  root: string;
  tracks: LocalTrack[];
  at: string;
  onFolder: (path: string) => void;
}) {
  const listing = folderListing(tracks, at);
  const crumbs: { name: string; path: string }[] = [];
  let cursor = root;
  for (const name of at.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    cursor = childPath(cursor, name);
    crumbs.push({ name, path: cursor });
  }
  const label = folderLabel(root);
  const empty = listing.folders.length === 0 && listing.files.length === 0;
  return (
    <div className="flex flex-col gap-5">
      {crumbs.length > 0 && (
        <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-[14px] text-ink-2">
          <button type="button" className={CRUMB} onClick={() => onFolder(root)}>
            {label}
          </button>
          {crumbs.map((crumb) => (
            <span key={crumb.path} className="flex items-center gap-1">
              <span aria-hidden="true">/</span>
              <button type="button" className={CRUMB} onClick={() => onFolder(crumb.path)}>
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      )}
      {listing.folders.length > 0 && (
        <div className={STACK_GRID}>
          {listing.folders.map((folder) => (
            <CoverStack
              key={folder.path}
              title={folder.name}
              subtitle={plural(folder.count, "song", "songs")}
              covers={[]}
              fallback={FolderOpenIcon}
              onOpen={() => onFolder(folder.path)}
              onPlay={() =>
                playTracks(
                  sortTracks(tracks.filter((track) => isUnderPath(track.path, folder.path)), "title"),
                  0,
                  folder.name,
                )
              }
            />
          ))}
        </div>
      )}
      {listing.files.map((track, index) => (
        <LocalTrackRow key={track.id} track={track} onPlay={() => playTracks(listing.files, index, label)} />
      ))}
      {empty && <EmptyState icon={MusicNote01Icon} title="This folder has no music yet." message="Add audio files to it, then rescan." />}
    </div>
  );
}

function CollectionView({ param, onBack, onGone }: { param: string; onBack: () => void; onGone: () => void }) {
  const library = useLocalLibrary((state) => state.library);
  const opened = useLocalLibrary((state) => state.opened);
  const missing = useLocalLibrary((state) => state.missing);
  const scanning = useLocalLibrary((state) => state.scanning);
  const scan = useLocalLibrary((state) => state.scan);
  const forgetOpened = useLocalLibrary((state) => state.forgetOpened);
  const [tab, setTab] = useState<LocalTab>("songs");
  const [sort, setSort] = useState<LocalSort>("title");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(null);
  const [folderAt, setFolderAt] = useState<string | null>(null);

  const scope = scopeOf(param);
  const folder = scope.kind === "folder" ? library.folders.find((item) => item.path === scope.path) : undefined;
  const rootPath = scope.kind === "folder" ? scope.path : "";
  const title =
    scope.kind === "all"
      ? "All songs"
      : scope.kind === "opened"
        ? "Opened files"
        : folder
          ? folderName(folder)
          : folderLabel(rootPath);
  const everything = scopeTracks(library.tracks, opened, scope, "");
  const scoped = scopeTracks(library.tracks, opened, scope, query);
  const list = sortTracks(scoped.filter((track) => matchesFilter(track, filter)), sort === "recent" ? "title" : sort);
  const folderTabs = scope.kind === "folder" ? folderListing(library.tracks, rootPath).folders.length : 0;
  const inMissing = scope.kind === "folder" && missing.includes(rootPath);
  const activeFolder = folderAt ?? rootPath;
  const phone = usePhone();

  const tabs: { id: LocalTab; label: string; count: number }[] = [
    { id: "songs", label: "Songs", count: list.length },
    { id: "albums", label: "Albums", count: albumGroups(scoped).length },
    { id: "artists", label: "Artists", count: artistGroups(scoped).length },
  ];
  if (folderTabs > 0) tabs.push({ id: "folders", label: "Folders", count: folderTabs });
  const songsSorted = sort === "artist" ? "artist" : "title";

  return (
    <div className="pb-14">
      <CollectionHero
        title={title}
        icon={FolderOpenIcon}
        onBack={phone ? onBack : undefined}
        covers={uniqueArt(everything, 8)}
        facts={
          <>
            <span>
              {plural(everything.length, "song", "songs")} · {fmtTotal(everything.reduce((sum, track) => sum + track.duration, 0))}
              {library.scannedAt > 0 && scope.kind !== "opened" && ` · Scanned ${scannedOn(library.scannedAt)}`}
            </span>
            {topArtist(everything) && (
              <span className={`block text-[13px] ${phone ? "text-ink-2" : "text-white/55"}`}>Top artist: {topArtist(everything)}</span>
            )}
            {scope.kind === "folder" && (
              <span className={`block break-all text-[13px] ${phone ? "text-ink-2" : "text-white/55"}`}>{rootPath}</span>
            )}
            {scope.kind === "opened" && (
              <span className={`block text-[13px] ${phone ? "text-ink-2" : "text-white/55"}`}>
                Songs you opened with {APP_NAME}. The files stay where they are.
              </span>
            )}
          </>
        }
      >
        <button
          type="button"
          className={phone ? PHONE_PLAY : PILL}
          disabled={list.length === 0}
          aria-label={`Play ${title}`}
          onClick={() => playTracks(list, 0, title)}
        >
          <HeroIcon icon={PlayIcon} /> Play
        </button>
        <button
          type="button"
          className={phone ? PHONE_SHUFFLE : ROUND}
          aria-label="Shuffle"
          title="Shuffle"
          disabled={list.length === 0}
          onClick={() => shuffleTracks(list, title)}
        >
          <HeroIcon icon={ShuffleIcon} />
          {phone && "Shuffle"}
        </button>
        {scope.kind !== "opened" && (
          <button
            type="button"
            className={phone ? PHONE_ICON : ROUND}
            aria-label="Rescan"
            title="Rescan"
            disabled={scanning}
            onClick={() => void scan()}
          >
            <span className={scanning ? "bt-spin" : undefined}>
              <Icon icon={RefreshIcon} />
            </span>
          </button>
        )}
        {folder && <FolderActions folder={folder} />}
        {!phone && (
          <button type="button" className={ROUND} aria-label="Back to Local Music" title="Local Music" onClick={onBack}>
            <Icon icon={ArrowLeft01Icon} />
          </button>
        )}
      </CollectionHero>

      {inMissing && (
        <p className={`${WARNING} mt-6 flex items-start gap-3`} role="alert">
          <Icon icon={Alert01Icon} />
          <span>
            This folder can&apos;t be reached right now. The list below is {APP_NAME}&apos;s last scan: rescan after
            reconnecting the drive, or remove the folder from {APP_NAME}.
          </span>
        </p>
      )}

      {scanning && (
        <div className="mt-6">
          <Spinner />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Collection views">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`${TAB} ${tab === item.id ? "bg-white text-black" : "bg-white/5 text-ink-2"}`}
          >
            {item.label}
            {item.count > 0 && ` · ${item.count}`}
          </button>
        ))}
        {tab === "songs" &&
          (["title", "artist"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={songsSorted === option}
              onClick={() => setSort(option)}
              className={`${TAB} ${songsSorted === option ? "bg-white/15 text-ink-1" : "text-ink-3"}`}
            >
              {option === "title" ? "Title" : "Artist"}
            </button>
          ))}
        <label className="relative ml-auto">
          <span className="sr-only">Search your files</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            <Icon icon={Search01Icon} />
          </span>
          <input
            type="search"
            value={query}
            placeholder="Search your files"
            onChange={(event) => setQuery(event.target.value)}
            className={FIELD}
          />
        </label>
      </div>

      {filter && (
        <button
          type="button"
          className="mt-4 text-[13px] text-ink-2 underline-offset-4 hover:underline"
          onClick={() => setFilter(null)}
        >
          ← Clear filter: {filter.kind === "album" ? filter.album : filter.artist}
        </button>
      )}

      <div className="mt-5">
        {tab === "songs" && (
          <SongsTab
            list={list}
            scopeEmpty={everything.length === 0}
            searching={query.trim().length > 0}
            isOpened={scope.kind === "opened"}
            onPlay={(index) => playTracks(list, index, title)}
            onForget={async (id) => {
              await forgetOpened(id);
              if (useLocalLibrary.getState().opened.length === 0) onGone();
            }}
          />
        )}
        {tab === "albums" && (
          <div className={STACK_GRID}>
            {albumGroups(scoped).map((group) => (
              <CoverStack
                key={group.key}
                title={group.album}
                subtitle={`${group.artist} · ${plural(group.count, "song", "songs")}`}
                covers={group.art ? [group.art] : []}
                fallback={PlayListIcon}
                onOpen={() => {
                  setFilter({ kind: "album", album: group.album, artist: group.artist });
                  setTab("songs");
                }}
                onPlay={() => playTracks(sortTracks(group.tracks, "title"), 0, group.album)}
              />
            ))}
          </div>
        )}
        {tab === "artists" && (
          <div className="grid gap-1 sm:grid-cols-2">
            {artistGroups(scoped).map((group) => (
              <button
                key={group.artist}
                type="button"
                className={ROW}
                onClick={() => {
                  setFilter({ kind: "artist", artist: group.artist });
                  setTab("songs");
                }}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.07]">
                  {group.art ? (
                    <img src={group.art} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon icon={UserIcon} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-ink-1">{group.artist}</span>
                  <span className="block text-[13px] text-ink-3">{plural(group.count, "song", "songs")}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {tab === "folders" && (
          <FolderTab root={rootPath} tracks={library.tracks} at={activeFolder} onFolder={setFolderAt} />
        )}
      </div>
    </div>
  );
}

function SongsTab({
  list,
  scopeEmpty,
  searching,
  isOpened,
  onPlay,
  onForget,
}: {
  list: LocalTrack[];
  scopeEmpty: boolean;
  searching: boolean;
  isOpened: boolean;
  onPlay: (index: number) => void;
  onForget: (id: string) => Promise<void>;
}) {
  if (list.length === 0) {
    if (scopeEmpty) {
      return <EmptyState icon={MusicNote01Icon} title="No music found in this folder" message="Add audio files to it, then rescan." />;
    }
    if (searching) {
      return <EmptyState icon={Search01Icon} title="Nothing matches that search" message="Try another word or clear the filter." />;
    }
    return <p className="text-[14px] text-ink-3">No songs.</p>;
  }
  return (
    <div className="flex flex-col">
      {list.map((track, index) => (
        <LocalTrackRow
          key={track.id}
          track={track}
          onPlay={() => onPlay(index)}
          onRemove={isOpened ? () => void onForget(track.id) : undefined}
        />
      ))}
    </div>
  );
}

export function LocalMusicView() {
  const param = useNavigation((state) => state.view.param);
  const navigate = useNavigation((state) => state.navigate);
  const loaded = useLocalLibrary((state) => state.loaded);
  const refresh = useLocalLibrary((state) => state.refresh);
  const library = useLocalLibrary((state) => state.library);
  const opened = useLocalLibrary((state) => state.opened);
  const scanning = useLocalLibrary((state) => state.scanning);
  const importFolders = useLocalLibrary((state) => state.importFromPicker);
  const phone = usePhone();

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  if (!param && library.folders.length === 0 && opened.length === 0) {
    return (
      <div className="pb-14">
        <PageHeader title="Local Music" />
        <div className={phone ? "" : "mt-6 flex min-h-[50vh] flex-col"}>
          <EmptyState
            centered
            icon={FolderOpenIcon}
            title="Play your own files"
            message="Import a folder and its songs play here, offline, with tags and cover art."
            action={{ label: scanning ? "Scanning…" : "Choose a folder", onClick: () => void importFolders() }}
          />
        </div>
      </div>
    );
  }

  if (!param) return <IndexView onOpen={(next) => navigate({ name: "local", param: next })} />;

  if (param.startsWith("net:")) {
    return <NetworkCollectionView id={param.slice(4)} onBack={() => navigate({ name: "local" })} />;
  }

  return <CollectionView key={param} param={param} onBack={() => navigate({ name: "local" })} onGone={() => navigate({ name: "local" })} />;
}

function NetworkCollectionView({ id, onBack }: { id: string; onBack: () => void }) {
  const servers = useNetwork((state) => state.servers);
  const tracks = useNetwork((state) => state.tracks[id] ?? []);
  const loadTracks = useNetwork((state) => state.loadTracks);
  const [busy, setBusy] = useState(true);
  const server = servers.find((entry) => entry.id === id);
  const phone = usePhone();

  useEffect(() => {
    let live = true;
    setBusy(true);
    void loadTracks(id, server?.path ?? "").finally(() => {
      if (live) setBusy(false);
    });
    return () => {
      live = false;
    };
  }, [id, loadTracks, server?.path]);

  const list = networkTracksOf(tracks);

  return (
    <div className="pb-14">
      <CollectionHero
        title={server?.name ?? "Network server"}
        icon={CloudServerIcon}
        onBack={phone ? onBack : undefined}
        covers={[]}
        facts={
          <span>
            {busy ? "Reading the server…" : plural(list.length, "song", "songs")}
            {server ? ` · ${server.kindLabel}` : ""}
          </span>
        }
      >
        <button
          type="button"
          className={phone ? PHONE_PLAY : PILL}
          disabled={list.length === 0}
          aria-label={`Play ${server?.name ?? "the server"}`}
          onClick={() => playNetworkTracks(list, 0, server?.name ?? "Network server")}
        >
          <HeroIcon icon={PlayIcon} /> Play
        </button>
        <button
          type="button"
          className={phone ? PHONE_SHUFFLE : ROUND}
          aria-label="Shuffle"
          title="Shuffle"
          disabled={list.length === 0}
          onClick={() => shuffleNetworkTracks(list, server?.name ?? "Network server")}
        >
          <HeroIcon icon={ShuffleIcon} />
          {phone && "Shuffle"}
        </button>
        {!phone && (
          <button type="button" className={ROUND} aria-label="Back to Local Music" title="Local Music" onClick={onBack}>
            <Icon icon={ArrowLeft01Icon} />
          </button>
        )}
      </CollectionHero>
      <div className="mt-5">
        {list.map((track, index) => (
          <button
            key={track.id}
            type="button"
            onClick={() => playNetworkTracks(list, index, server?.name ?? "Network server")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left [@media(hover:hover)]:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink-1">{track.title}</span>
              <span className="block truncate text-[12.5px] text-ink-3">{track.artist}</span>
            </span>
          </button>
        ))}
        {!busy && list.length === 0 && (
          <EmptyState title="No songs on this server" message="Check the folder and try again." />
        )}
      </div>
    </div>
  );
}
