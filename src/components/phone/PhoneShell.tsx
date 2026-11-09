import { useLayoutEffect } from "react";
import { motion } from "motion/react";
import { Dialog } from "../Dialog";
import { ErrorBoundary } from "../ErrorBoundary";
import { PlaylistPicker } from "../PlaylistPicker";
import { Toasts } from "../Toasts";
import { MiniPlayer } from "./MiniPlayer";
import { PhoneMenuSheet } from "./PhoneMenuSheet";
import { PhoneNowPlaying } from "./PhoneNowPlaying";
import { PhoneQueueSheet } from "./PhoneQueueSheet";
import { TabBar } from "./TabBar";
import { usePhoneBack } from "./usePhoneBack";
import { CurrentView } from "../../views/CurrentView";
import { fade, gate, reducedMotion } from "../../lib/motion";
import { INSET_TOP, phoneBottomPad, phoneToastBottom } from "../../lib/phoneNav";
import { currentTrack, usePlayer } from "../../stores/player";
import { useNavigation } from "../../stores/navigation";

export function PhoneShell() {
  const view = useNavigation((state) => state.view);
  const pendingScroll = useNavigation((state) => state.pendingScroll);
  const viewReloadNonce = useNavigation((state) => state.viewReloadNonce);
  const clearPendingScroll = useNavigation((state) => state.clearPendingScroll);
  const track = usePlayer(currentTrack);
  const reduced = reducedMotion();
  usePhoneBack();

  useLayoutEffect(() => {
    if (pendingScroll === null) return;
    const scroller = document.getElementById("view-scroll");
    if (scroller) scroller.scrollTop = pendingScroll;
    clearPendingScroll();
  }, [pendingScroll, clearPendingScroll]);

  const screenKey = `${viewReloadNonce}:${view.name}:${view.name === "settings" ? "" : (view.param ?? "")}`;

  return (
    <div spellCheck={false} className="relative flex h-screen select-none flex-col overflow-hidden bg-base text-ink-1">
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <div
          id="view-scroll"
          className="no-scrollbar h-full overflow-y-auto overflow-x-hidden"
          style={{ paddingBottom: phoneBottomPad(track !== null) }}
        >
          <motion.div
            key={screenKey}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={gate(reduced, fade)}
            className="px-4"
            style={{ paddingTop: `calc(${INSET_TOP} + 12px)` }}
          >
            <ErrorBoundary scope="view" resetKey={`${viewReloadNonce}:${view.name}`}>
              <CurrentView view={view} />
            </ErrorBoundary>
          </motion.div>
        </div>
      </main>

      <MiniPlayer />
      <TabBar />
      <PhoneNowPlaying />
      <Toasts bottom={phoneToastBottom(track !== null)} />
      <PhoneQueueSheet />
      <Dialog sheet />
      <PlaylistPicker />
      <PhoneMenuSheet />
    </div>
  );
}
