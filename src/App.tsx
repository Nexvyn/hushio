import { useEffect, useLayoutEffect, useRef } from "react";
import { AnimatePresence, motion, useTransform } from "motion/react";
import { EdgeFades } from "./components/EdgeFades";
import { SongInfoSheet } from "./components/SongInfoSheet";
import { ContextMenu } from "./components/ContextMenu";
import { Dialog } from "./components/Dialog";
import { PlaylistEditDialog } from "./components/PlaylistEditDialog";
import { TrackEditDialog } from "./components/TrackEditDialog";
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
import { railFor, shellFor, sidebarFor, useShortSide, useViewportWidth } from "./lib/layoutTier";
import { startWindowGlass } from "./lib/windowGlass";
import { nowPlayingRoll, rollHeight } from "./lib/nowPlayingRoll";
import { rollStyles } from "./lib/rollUp";
import { useScrimMounted } from "./lib/useScrimMounted";
import { reducedMotion } from "./lib/motion";
import { startUpdates } from "./stores/updates";
import { useKeyboardShortcuts, useSwipeNavigation } from "./lib/shortcuts";
import { useMenuCommands } from "./lib/menuWiring";
import { startTraySync } from "./lib/traySync";
import { startYtSync } from "./stores/sync";
import { currentTrack, usePlayer } from "./stores/player";
import { useNavigation } from "./stores/navigation";
import { useUI } from "./stores/ui";
import { CurrentView } from "./views/CurrentView";
import { AmbientSync } from "./components/AmbientBackdrop";
import { ViewTransition } from "./components/ViewTransition";
import { navDirection, type NavDirection, type NavSnapshot } from "./lib/navDirection";

export default function App() {
  const view = useNavigation((state) => state.view);
  const tab = useNavigation((state) => state.tab);
  const past = useNavigation((state) => state.navPast.length);
  const future = useNavigation((state) => state.navFuture.length);
  const pendingScroll = useNavigation((state) => state.pendingScroll);
  const viewReloadNonce = useNavigation((state) => state.viewReloadNonce);
  const clearPendingScroll = useNavigation((state) => state.clearPendingScroll);
  const setOsFullscreen = useUI((state) => state.setOsFullscreen);
  const lyricsCenter = useUI((state) => state.lyricsCenter);
  const hasTrack = usePlayer((state) => currentTrack(state) !== null);
  const railSheetOpen = useUI((state) => state.railSheetOpen);
  const railColumnOpen = useUI((state) => state.railColumnOpen);
  const width = useViewportWidth();
  const shortSide = useShortSide();
  const android = platform === "android";
  const nav = useRef<{ key: string; snapshot: NavSnapshot; direction: NavDirection }>({
    key: "",
    snapshot: { view, past, future, tab },
    direction: "none",
  });
  const navKey = `${view.name}:${view.param ?? ""}|${past}|${future}|${tab}`;
  if (nav.current.key !== navKey) {
    const snapshot: NavSnapshot = { view, past, future, tab };
    nav.current = { key: navKey, snapshot, direction: nav.current.key === "" ? "none" : navDirection(nav.current.snapshot, snapshot) };
  }

  const reducedRoll = reducedMotion();
  const roll = useTransform([nowPlayingRoll, rollHeight], ([p, h]) => rollStyles(p as number, h as number, reducedRoll));
  const rollClip = useTransform(roll, (r) => r.page);
  const rollShade = useTransform(roll, (r) => r.shade);
  const scrimOn = useScrimMounted(rollShade);

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

  if (android && shellFor(shortSide) === "phone") return <PhoneShell />;

  return (
    <div
      spellCheck={false}
      className="app-shell flex h-screen select-none flex-col overflow-hidden bg-base text-ink-1"
    >
      <motion.div className="relative flex min-h-0 flex-1 flex-col" style={{ clipPath: rollClip }}>
        <TopBar />

        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden px-2 pb-2">
          <Sidebar mode={sidebarFor(width)} />

          <main className="app-main relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[8px] bg-surface">
            <EdgeFades id="view-scroll" className="no-scrollbar h-full overflow-x-hidden">
              <ViewTransition
                routeKey={`${viewReloadNonce}:${view.name}:${view.name === "settings" ? "" : (view.param ?? "")}`}
                direction={nav.current.direction}
                className="app-view-content px-6 pb-8 pt-4"
              >
                <ErrorBoundary
                  scope="view"
                  resetKey={`${viewReloadNonce}:${view.name}`}
                >
                  <CurrentView view={view} />
                </ErrorBoundary>
              </ViewTransition>
            </EdgeFades>
            <AnimatePresence>{lyricsCenter && <LyricsCenter key="lyrics" />}</AnimatePresence>
            <SwipeArrow />
          </main>

          {railFor(width) === "sheet"
            ? <AnimatePresence>{railSheetOpen && <RightRail key="rail-sheet" mode="sheet" />}</AnimatePresence>
            : <AnimatePresence>{hasTrack && railColumnOpen && <RightRail key="rail-column" mode="column" />}</AnimatePresence>}
        </div>

        {scrimOn && <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 z-50 bg-base/40" style={{ opacity: rollShade }} />}
        <PlayerBar />
      </motion.div>
      <AmbientSync />
      <NowPlaying />
      <Toasts />
      <FileDrop />
      <Dialog />
      <PlaylistEditDialog />
      <TrackEditDialog />
      <EraseDialog />
      <PlaylistPicker />
      <ContextMenu />
      <SongInfoSheet />
    </div>
  );
}
