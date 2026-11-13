import { useLayoutEffect, useRef } from "react";
import { motion } from "motion/react";
import { Dialog } from "../Dialog";
import { ErrorBoundary } from "../ErrorBoundary";
import { PlaylistPicker } from "../PlaylistPicker";
import { Toasts } from "../Toasts";
import { MiniPlayer } from "./MiniPlayer";
import { NotificationBanner } from "./NotificationBanner";
import { PhoneMenuSheet } from "./PhoneMenuSheet";
import { PhoneNowPlaying } from "./PhoneNowPlaying";
import { PhoneQueueSheet } from "./PhoneQueueSheet";
import { TabBar } from "./TabBar";
import { CurrentView } from "../../views/CurrentView";
import { PHONE_MS, phoneSmooth, phoneTween, reducedMotion } from "../../lib/motion";
import { navDirection, type NavDirection, type NavSnapshot } from "../../lib/navDirection";
import { INSET_TOP, phoneBottomBlock, phoneBottomPad, phoneToastBottom } from "../../lib/phoneNav";
import { currentTrack, usePlayer } from "../../stores/player";
import { useNavigation } from "../../stores/navigation";

const SLIDE_PX = 24;

export function PhoneShell() {
  const view = useNavigation((state) => state.view);
  const past = useNavigation((state) => state.navPast.length);
  const future = useNavigation((state) => state.navFuture.length);
  const pendingScroll = useNavigation((state) => state.pendingScroll);
  const viewReloadNonce = useNavigation((state) => state.viewReloadNonce);
  const clearPendingScroll = useNavigation((state) => state.clearPendingScroll);
  const track = usePlayer(currentTrack);
  const reduced = reducedMotion();
  const last = useRef<{ key: string; snap: NavSnapshot; direction: NavDirection }>({
    key: "",
    snap: { view, past, future },
    direction: "none",
  });
  const historyKey = `${view.name}:${view.param ?? ""}|${past}|${future}`;
  if (last.current.key !== historyKey) {
    const snap: NavSnapshot = { view, past, future };
    last.current = { key: historyKey, snap, direction: last.current.key === "" ? "none" : navDirection(last.current.snap, snap) };
  }
  const direction = last.current.direction;
  const slide = direction === "push" ? SLIDE_PX : direction === "pop" ? -SLIDE_PX : 0;

  useLayoutEffect(() => {
    if (pendingScroll === null) return;
    const scroller = document.getElementById("view-scroll");
    if (scroller) scroller.scrollTop = pendingScroll;
    clearPendingScroll();
  }, [pendingScroll, clearPendingScroll]);

  const screenKey = `${viewReloadNonce}:${view.name}:${view.param ?? ""}`;

  return (
    <div spellCheck={false} className="relative flex h-screen select-none flex-col overflow-hidden bg-base text-ink-1">
      <div
        aria-hidden="true"
        data-status-strip
        className="absolute inset-x-0 top-0 z-10 bg-[color:var(--phone-status-bg,rgb(var(--base)))] motion-safe:transition-colors motion-safe:duration-swap"
        style={{ height: INSET_TOP }}
      />
      <main className="relative isolate z-0 min-h-0 flex-1 overflow-hidden">
        <div
          id="view-scroll"
          className="no-scrollbar h-full overflow-y-auto overflow-x-hidden"
          style={{ paddingBottom: phoneBottomPad(track !== null) }}
        >
          <motion.div
            key={screenKey}
            initial={reduced ? false : { opacity: 0, x: slide }}
            animate={{ opacity: 1, x: 0 }}
            transition={
              direction === "push" || direction === "pop"
                ? { x: phoneSmooth, opacity: phoneTween(PHONE_MS.navFade) }
                : phoneTween(PHONE_MS.tab)
            }
            className="px-4"
            style={{ paddingTop: `calc(${INSET_TOP} + 12px)` }}
          >
            <ErrorBoundary scope="view" resetKey={`${viewReloadNonce}:${view.name}`}>
              <CurrentView view={view} />
            </ErrorBoundary>
          </motion.div>
        </div>
      </main>

      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-10 bg-base" style={{ height: phoneBottomBlock(track !== null) }} />
      <MiniPlayer />
      <TabBar />
      <PhoneNowPlaying />
      <Toasts bottom={phoneToastBottom(track !== null)} />
      <NotificationBanner />
      <PhoneQueueSheet />
      <Dialog sheet />
      <PlaylistPicker />
      <PhoneMenuSheet />
    </div>
  );
}
