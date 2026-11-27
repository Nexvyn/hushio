import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { AnimatePresence, motion, useTransform } from "motion/react";
import type { Transition } from "motion/react";
import { Dialog } from "../Dialog";
import { EraseDialog } from "../EraseDialog";
import { ErrorBoundary } from "../ErrorBoundary";
import { PlaylistPicker } from "../PlaylistPicker";
import { PlaylistEditDialog } from "../PlaylistEditDialog";
import { Toasts } from "../Toasts";
import { MiniPlayer } from "./MiniPlayer";
import { NotificationBanner } from "./NotificationBanner";
import { PhoneMenuSheet } from "./PhoneMenuSheet";
import { PhoneNowPlaying } from "./PhoneNowPlaying";
import { useSheetOpen } from "./phoneOverlays";
import { pageCardOf, sheetProgress, watchSheetInterruptions } from "./sheetTravel";
import { TabBar } from "./TabBar";
import { useEdgeBack } from "./useEdgeBack";
import { useNativeTabBar } from "./useNativeTabBar";
import { useOverscrollStretch } from "./useOverscrollStretch";
import { topStretchFor } from "./overscrollStretch";
import { CurrentView } from "../../views/CurrentView";
import { platform } from "../../lib/bridge";
import { DURATION_MS, EASE_IN, EASE_OUT, PHONE_MS, fade, phoneTween, reducedMotion } from "../../lib/motion";
import { navDirection, type NavDirection, type NavSnapshot } from "../../lib/navDirection";
import { useScrimMounted } from "../../lib/useScrimMounted";
import { INSET_TOP, INSET_BOTTOM, TAB_BAR_DP, phoneBottomPad, tabOfRoot } from "../../lib/phoneNav";
import { currentTrack, usePlayer } from "../../stores/player";
import { useNavigation } from "../../stores/navigation";
import { useUI } from "../../stores/ui";

const PAGE_PUSH_X = 24;
const PAGE_DIM_X = -8;
const PAGE_DIM_OPACITY = 0.6;

const pageIn: Transition = { duration: DURATION_MS.pageIn / 1000, ease: EASE_OUT };
const pageOut: Transition = { duration: DURATION_MS.swap / 1000, ease: EASE_IN };
const tabFade: Transition = phoneTween(PHONE_MS.tab);

type PageDirection = "push" | "pop" | "tab" | "none";

function screenVariants(reduced: boolean) {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: fade },
      exit: { opacity: 0, transition: fade },
    };
  }
  return {
    enter: (d: PageDirection) =>
      d === "push" ? { x: PAGE_PUSH_X, opacity: 0 } : d === "pop" ? { x: PAGE_DIM_X, opacity: PAGE_DIM_OPACITY } : { x: 0, opacity: 0 },
    center: (d: PageDirection) => ({ x: 0, opacity: 1, transition: d === "push" || d === "pop" ? pageIn : tabFade }),
    exit: (d: PageDirection) =>
      d === "push"
        ? { x: PAGE_DIM_X, opacity: PAGE_DIM_OPACITY, transition: pageOut }
        : d === "pop"
          ? { x: PAGE_PUSH_X, opacity: 0, transition: pageOut }
          : { opacity: 0, transition: tabFade },
  };
}

export function PhoneShell() {
  const view = useNavigation((state) => state.view);
  const tab = useNavigation((state) => state.tab);
  const past = useNavigation((state) => state.navPast.length);
  const future = useNavigation((state) => state.navFuture.length);
  const goBack = useNavigation((state) => state.goBack);
  const nowPlayingOpen = useUI((state) => state.nowPlayingOpen);
  const searchFocused = useUI((state) => state.searchFocused);
  const sheetOpen = useSheetOpen();
  const overlayOpen = sheetOpen || nowPlayingOpen;
  const edge = useEdgeBack({ enabled: past > 0 && !overlayOpen, onBack: goBack });
  const pendingScroll = useNavigation((state) => state.pendingScroll);
  const viewReloadNonce = useNavigation((state) => state.viewReloadNonce);
  const clearPendingScroll = useNavigation((state) => state.clearPendingScroll);
  const track = usePlayer(currentTrack);
  const reduced = reducedMotion();
  const card = useTransform(sheetProgress, (p) => pageCardOf(p, reduced));
  const pageScale = useTransform(card, (c) => c.scale);
  const pageRadius = useTransform(card, (c) => c.radius);
  const pageShade = useTransform(card, (c) => c.shade);
  const scrimOn = useScrimMounted(pageShade);
  const last = useRef<{ key: string; snap: NavSnapshot; direction: NavDirection }>({
    key: "",
    snap: { view, past, future, tab },
    direction: "none",
  });
  const historyKey = `${view.name}:${view.param ?? ""}|${past}|${future}`;
  if (last.current.key !== historyKey) {
    const snap: NavSnapshot = { view, past, future, tab };
    last.current = { key: historyKey, snap, direction: last.current.key === "" ? "none" : navDirection(last.current.snap, snap) };
  }
  const direction = last.current.direction;

  useEffect(watchSheetInterruptions, []);

  const tabActive = view.name === "settings" ? null : tabOfRoot(view) ?? tab;
  const nativeTabs = platform === "android";
  useNativeTabBar({ enabled: nativeTabs, active: tabActive });
  useOverscrollStretch("view-scroll", { top: topStretchFor(view.name), bottom: true });

  useLayoutEffect(() => {
    if (pendingScroll === null) return;
    const scroller = document.getElementById("view-scroll");
    if (scroller) scroller.scrollTop = pendingScroll;
    clearPendingScroll();
  }, [pendingScroll, clearPendingScroll]);

  const screenKey = `${viewReloadNonce}:${view.name}:${view.param ?? ""}`;
  const screen = useMemo(
    () => (
      <ErrorBoundary scope="view" resetKey={`${viewReloadNonce}:${view.name}`}>
        <CurrentView view={view} />
      </ErrorBoundary>
    ),
    [view, viewReloadNonce],
  );

  const scrollToTop = () => {
    document.getElementById("view-scroll")?.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <div spellCheck={false} className="relative flex h-screen supports-[height:100dvh]:h-dvh select-none flex-col overflow-hidden bg-base text-ink-1">
      {scrimOn && <div aria-hidden="true" className="absolute inset-0 bg-black" />}
      <motion.div
        data-phone-page
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-base will-change-transform"
        style={{ scale: pageScale, borderRadius: pageRadius, transformOrigin: "50% 0%" }}
      >
        <div
          aria-hidden="true"
          data-status-strip
          onClick={scrollToTop}
          className={`absolute inset-x-0 top-0 z-10 motion-safe:transition-colors motion-safe:duration-swap ${
            view.name === "settings" ? "bg-base" : "bg-[color:var(--phone-status-bg,rgb(var(--base)))]"
          }`}
          style={{ height: INSET_TOP }}
        />
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={{ x: edge.x, opacity: edge.shadow, boxShadow: "-12px 0 24px rgb(0 0 0)" }} />
        <motion.main style={{ x: edge.x, scale: edge.scale, borderRadius: edge.radius }}className={`relative isolate z-0 min-h-0 flex-1 overflow-hidden will-change-transform ${nowPlayingOpen ? "pointer-events-none" : ""}`}>
          <div
            id="view-scroll"
            className="no-scrollbar h-full overflow-y-auto overflow-x-hidden"
            style={{
              paddingBottom: phoneBottomPad(track !== null),
              "--phone-empty-offset": `calc(${INSET_TOP} + ${phoneBottomPad(track !== null)} + 44px)`,
            } as CSSProperties}
          >
            <div className="relative">
              <AnimatePresence mode="popLayout" custom={direction}>
                <motion.div
                  key={screenKey}
                  custom={direction}
                  variants={screenVariants(reduced)}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="px-4"
                  style={{ paddingTop: `calc(${INSET_TOP} + 12px)` }}
                >
                  {screen}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 bg-scrim" style={{ opacity: edge.shade }} />
        </motion.main>
        <motion.div
          data-phone-chrome
          aria-hidden={searchFocused || undefined}
          initial={false}
          animate={{ y: searchFocused && !reduced ? 12 : 0, opacity: searchFocused ? 0 : 1 }}
          transition={reduced ? fade : phoneTween(PHONE_MS.tab)}
          className={`absolute inset-x-0 bottom-0 z-20 overflow-hidden rounded-t-[24px] bg-surface shadow-[0_-4px_24px_rgb(0_0_0/0.12)] ${searchFocused ? "pointer-events-none" : ""}`}
        >
          <MiniPlayer />
          {nativeTabs ? (
            <div aria-hidden="true" className="shrink-0" style={{ height: TAB_BAR_DP }} />
          ) : (
            <TabBar activeTab={tabActive} />
          )}
          <div aria-hidden="true" className="bg-surface" style={{ height: INSET_BOTTOM }} />
        </motion.div>
        {scrimOn && <motion.div aria-hidden="true" data-page-shade className="pointer-events-none absolute inset-0 z-30 bg-black will-change-[opacity]" style={{ opacity: pageShade }} />}
      </motion.div>

      <PhoneNowPlaying />
      <Toasts />
      <NotificationBanner />
      <Dialog sheet />
      <PlaylistEditDialog />
      <PlaylistPicker />
      <EraseDialog />
      <PhoneMenuSheet />
    </div>
  );
}
