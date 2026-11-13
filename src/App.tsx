import { GooFilter } from "./components/Goo";
import { useEffect, useLayoutEffect } from "react";
import { EdgeFades } from "./components/EdgeFades";
import { ContextMenu } from "./components/ContextMenu";
import { CommentsDialog } from "./components/CommentsDialog";
import { Dialog } from "./components/Dialog";
import { EraseDialog } from "./components/EraseDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LyricsCenter } from "./components/LyricsCenter";
import { NowPlaying } from "./components/NowPlaying";
import { PhoneShell } from "./components/phone/PhoneShell";
import { usePhoneBack } from "./components/phone/usePhoneBack";
import { PlayerBar } from "./components/PlayerBar";
import { PlaylistPicker } from "./components/PlaylistPicker";
import { RightRail } from "./components/RightRail";
import { FileDrop } from "./components/FileDrop";
import { Sidebar } from "./components/Sidebar";
import { SwipeArrow } from "./components/SwipeArrow";
import { Toasts } from "./components/Toasts";
import { TopBar } from "./components/TopBar";
import { platform, watchFullScreen } from "./lib/bridge";
import { listenForDownloadProgress } from "./lib/downloads";
import { startLaunchActions } from "./lib/launch";
import { railFor, shellFor, sidebarFor, useViewportWidth } from "./lib/layoutTier";
import { startWindowGlass } from "./lib/windowGlass";
import { startUpdates } from "./stores/updates";
import { useKeyboardShortcuts, useSwipeNavigation } from "./lib/shortcuts";
import { useMenuCommands } from "./lib/menuWiring";
import { startTraySync } from "./lib/traySync";
import { startYtSync } from "./stores/sync";
import { useNavigation } from "./stores/navigation";
import { useUI } from "./stores/ui";
import { CurrentView } from "./views/CurrentView";
import { AmbientSync } from "./components/AmbientBackdrop";
import { ViewTransition } from "./components/ViewTransition";

export default function App() {
  const view = useNavigation((state) => state.view);
  const pendingScroll = useNavigation((state) => state.pendingScroll);
  const viewReloadNonce = useNavigation((state) => state.viewReloadNonce);
  const clearPendingScroll = useNavigation((state) => state.clearPendingScroll);
  const setOsFullscreen = useUI((state) => state.setOsFullscreen);
  const lyricsCenter = useUI((state) => state.lyricsCenter);
  const width = useViewportWidth();
  const android = platform === "android";

  useKeyboardShortcuts();
  useSwipeNavigation();
  useMenuCommands();
  usePhoneBack(android);

  useEffect(() => startYtSync(), []);
  useEffect(() => startTraySync(), []);
  useEffect(() => startWindowGlass(), []);
  useEffect(() => startLaunchActions(), []);
  useEffect(() => startUpdates(), []);

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

  if (android && shellFor(width) === "phone") return <PhoneShell />;

  return (
    <div
      spellCheck={false}
      className="flex h-screen select-none flex-col overflow-hidden bg-surface text-ink-1"
    >
      <GooFilter />
      <TopBar />

      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        <Sidebar mode={sidebarFor(width)} />

        <main className="relative min-w-0 flex-1 overflow-hidden rounded-[10px] bg-surface">
          <EdgeFades id="view-scroll" className="no-scrollbar h-full">
            <ViewTransition
              routeKey={`${viewReloadNonce}:${view.name}:${view.name === "settings" ? "" : (view.param ?? "")}`}
              className="px-10 pb-6 pt-5"
            >
              <ErrorBoundary
                scope="view"
                resetKey={`${viewReloadNonce}:${view.name}`}
              >
                <CurrentView view={view} />
              </ErrorBoundary>
            </ViewTransition>
          </EdgeFades>
          {lyricsCenter && <LyricsCenter />}
          <SwipeArrow />
        </main>

        <RightRail mode={railFor(width)} />
      </div>

      <AmbientSync />
      <PlayerBar />
      <NowPlaying />
      <Toasts />
      <FileDrop />
      <Dialog />
      <EraseDialog />
      <PlaylistPicker />
      <ContextMenu />
      <CommentsDialog />
    </div>
  );
}
