import { useEffect, useLayoutEffect } from "react";
import { ContextMenu } from "./components/ContextMenu";
import { Dialog } from "./components/Dialog";
import { EraseDialog } from "./components/EraseDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LyricsCenter } from "./components/LyricsCenter";
import { NowPlaying } from "./components/NowPlaying";
import { PlayerBar } from "./components/PlayerBar";
import { PlaylistPicker } from "./components/PlaylistPicker";
import { RightRail } from "./components/RightRail";
import { FileDrop } from "./components/FileDrop";
import { Sidebar } from "./components/Sidebar";
import { SwipeArrow } from "./components/SwipeArrow";
import { Toasts } from "./components/Toasts";
import { TopBar } from "./components/TopBar";
import { watchFullScreen } from "./lib/bridge";
import { listenForDownloadProgress } from "./lib/downloads";
import { startLaunchActions } from "./lib/launch";
import { startMenuCommands } from "./lib/menuCommands";
import { startWindowGlass } from "./lib/windowGlass";
import { useKeyboardShortcuts, useSwipeNavigation } from "./lib/shortcuts";
import { startGoogleAuth } from "./stores/auth";
import { startYtSync } from "./stores/sync";
import { useNavigation, type View } from "./stores/navigation";
import { useUI } from "./stores/ui";
import { AlbumView } from "./views/AlbumView";
import { ArtistView } from "./views/ArtistView";
import { DownloadsView } from "./views/DownloadsView";
import { ExploreView } from "./views/ExploreView";
import { FolderView } from "./views/FolderView";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { LikedView } from "./views/LikedView";
import { LocalMusicView } from "./views/LocalMusicView";
import { MatchedPlaylistView } from "./views/MatchedPlaylistView";
import { MoodView } from "./views/MoodView";
import { PlaylistView } from "./views/PlaylistView";
import { PodcastsView } from "./views/PodcastsView";
import { PodcastView } from "./views/PodcastView";
import { RemotePlaylistView } from "./views/RemotePlaylistView";
import { ReplayView } from "./views/ReplayView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

function CurrentView({ view }: { view: View }) {
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "explore":
      return <ExploreView />;
    case "search":
      return <SearchView />;
    case "library":
      return view.param === "liked" ? <LikedView /> : <LibraryView />;
    case "playlists":
      return <LibraryView />;
    case "playlist":
      return <PlaylistView />;
    case "folder":
      return <FolderView />;
    case "ytplaylist":
      return <RemotePlaylistView />;
    case "import":
      return <MatchedPlaylistView />;
    case "album":
      return <AlbumView />;
    case "artist":
      return <ArtistView />;
    case "downloads":
      return <DownloadsView />;
    case "local":
      return <LocalMusicView />;
    case "replay":
      return <ReplayView />;
    case "podcast":
      return view.param ? <PodcastView /> : null;
    case "podcasts":
      return <PodcastsView />;
    case "mood":
      return view.param ? <MoodView /> : null;
    case "settings":
      return <SettingsView />;
  }
}

export default function App() {
  const view = useNavigation((state) => state.view);
  const pendingScroll = useNavigation((state) => state.pendingScroll);
  const viewReloadNonce = useNavigation((state) => state.viewReloadNonce);
  const clearPendingScroll = useNavigation((state) => state.clearPendingScroll);
  const setOsFullscreen = useUI((state) => state.setOsFullscreen);
  const lyricsCenter = useUI((state) => state.lyricsCenter);

  useKeyboardShortcuts();
  useSwipeNavigation();

  useEffect(() => startGoogleAuth(), []);
  useEffect(() => startYtSync(), []);
  useEffect(() => startMenuCommands(), []);
  useEffect(() => startWindowGlass(), []);
  useEffect(() => startLaunchActions(), []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let live = true;
    void listenForDownloadProgress()
      .then((unlisten) => {
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch((error: unknown) => console.warn(`[hushio] download events unavailable: ${String(error)}`));
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let live = true;
    void watchFullScreen(setOsFullscreen)
      .then((unlisten) => {
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, [setOsFullscreen]);

  useLayoutEffect(() => {
    if (pendingScroll === null) return;
    const scroller = document.getElementById("view-scroll");
    if (scroller) scroller.scrollTop = pendingScroll;
    clearPendingScroll();
  }, [pendingScroll, clearPendingScroll]);

  return (
    <div
      spellCheck={false}
      className="flex h-screen select-none flex-col overflow-hidden bg-base text-ink-1"
    >
      <TopBar />

      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-1">
        <Sidebar />

        <main className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-card-edge/[0.08] bg-surface shadow-[var(--shadow-card)]">
          <div id="view-scroll" className="no-scrollbar h-full overflow-y-auto">
            <div
              key={`${viewReloadNonce}:${view.name}:${view.name === "settings" ? "" : (view.param ?? "")}`}
              className="px-10 pb-6 pt-5"
            >
              <ErrorBoundary
                scope="view"
                resetKey={`${viewReloadNonce}:${view.name}`}
              >
                <CurrentView view={view} />
              </ErrorBoundary>
            </div>
          </div>
          {lyricsCenter && <LyricsCenter />}
          <SwipeArrow />
        </main>

        <RightRail />
      </div>

      <PlayerBar />
      <NowPlaying />
      <Toasts />
      <FileDrop />
      <Dialog />
      <EraseDialog />
      <PlaylistPicker />
      <ContextMenu />
    </div>
  );
}
