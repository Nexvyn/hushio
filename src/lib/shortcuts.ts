import { useEffect, useRef } from "react";
import { naturalScrollDirection, setFullScreen } from "./bridge";
import { createSwipeNav, scrollsSideways, SWIPE_LIFT_MS, type SwipeDir, type SwipeUpdate } from "./swipe";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import { swipeArrow } from "../components/SwipeArrow";

const NON_TEXT_INPUTS = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "color", "file"]);
const SEEK_STEP_S = 5;
const VOLUME_STEP = 0.05;

export function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  if (target.tagName === "TEXTAREA") return true;
  return target.isContentEditable;
}

function playbackKey(event: KeyboardEvent): boolean {
  const player = usePlayer.getState();
  const ui = useUI.getState();
  switch (event.code) {
    case "Space":
      player.toggle();
      return true;
    case "ArrowLeft":
      if (event.shiftKey) player.prev();
      else player.seek(player.position - SEEK_STEP_S);
      return true;
    case "ArrowRight":
      if (event.shiftKey) player.next(true);
      else player.seek(player.position + SEEK_STEP_S);
      return true;
    case "ArrowUp":
      if (event.altKey) return false;
      player.setVolume(player.volume + VOLUME_STEP);
      return true;
    case "ArrowDown":
      if (event.altKey) return false;
      player.setVolume(player.volume - VOLUME_STEP);
      return true;
    case "KeyM":
      player.toggleMute();
      return true;
    case "KeyS":
      player.toggleShuffle();
      return true;
    case "KeyR":
      player.cycleRepeat();
      return true;
    case "KeyQ":
      ui.toggleQueue();
      return true;
    case "KeyL":
      ui.toggleLyrics();
      return true;
    case "KeyN":
      ui.toggleNowPlaying();
      return true;
    default:
      return false;
  }
}

export function focusSearch() {
  const settings = document.getElementById("settings-filter");
  const target = settings ?? document.getElementById("global-search");
  if (!(target instanceof HTMLInputElement)) return;
  target.focus();
  target.select();
}

function isPlainArrow(event: KeyboardEvent) {
  return (
    (event.code === "ArrowLeft" ||
      event.code === "ArrowRight" ||
      event.code === "ArrowUp" ||
      event.code === "ArrowDown") &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const ui = useUI.getState();
      const nav = useNavigation.getState();
      const layered = Boolean(ui.dialog || ui.contextMenu || ui.playlistPicker);

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === "f") {
          if (layered) return;
          event.preventDefault();
          focusSearch();
        }
        return;
      }

      if (layered) return;

      if (event.key === "Escape") {
        if (useUI.getState().osFullscreen && !useUI.getState().nowPlayingOpen) {
          void setFullScreen(false);
          return;
        }
      }

      if (isTyping(event.target)) return;

      if (event.key === "Escape") {
        const state = useUI.getState();
        if (state.nowPlayingOpen) {
          state.toggleNowPlaying();
        } else if (state.rightPanel === "queue" || state.lyricsCenter) {
          state.closePanels();
        }
        return;
      }

      if (event.repeat && !isPlainArrow(event)) return;

      if (event.code === "Slash" && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.altKey && event.code === "ArrowLeft") {
        event.preventDefault();
        nav.goBack();
        return;
      }

      if (event.altKey && event.code === "ArrowRight") {
        event.preventDefault();
        nav.goForward();
        return;
      }

      if (playbackKey(event)) event.preventDefault();
    }

    function onMouseUp(event: MouseEvent) {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      const ui = useUI.getState();
      if (ui.dialog || ui.contextMenu || ui.playlistPicker || ui.nowPlayingOpen) return;
      const nav = useNavigation.getState();
      if (event.button === 3) nav.goBack();
      else nav.goForward();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
}

export function useSwipeNavigation() {
  const natural = useRef<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void naturalScrollDirection().then((value) => {
      if (live) natural.current = value;
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const swipe = createSwipeNav(() => (natural.current === false ? -1 : 1));
    let lift: ReturnType<typeof setTimeout> | undefined;

    function blocked() {
      const ui = useUI.getState();
      return Boolean(ui.dialog || ui.contextMenu || ui.playlistPicker || ui.nowPlayingOpen);
    }

    function can(dir: SwipeDir) {
      const nav = useNavigation.getState();
      return dir === "back" ? nav.navPast.length > 0 : nav.navFuture.length > 0;
    }

    function apply(update: SwipeUpdate) {
      if (!update) return;
      if (update.kind === "track") {
        if (blocked()) swipeArrow.cancel();
        else swipeArrow.track(update.dir, update.progress);
        return;
      }
      if (update.kind === "cancel") {
        swipeArrow.cancel();
        return;
      }
      if (blocked()) {
        swipeArrow.cancel();
        return;
      }
      swipeArrow.commit();
      const nav = useNavigation.getState();
      if (update.dir === "back") nav.goBack();
      else nav.goForward();
    }

    function onWheel(event: WheelEvent) {
      if (lift) clearTimeout(lift);
      apply(
        swipe.wheel(
          event,
          (dx) => scrollsSideways(event.target, dx),
          can,
        ),
      );
      lift = setTimeout(() => apply(swipe.quiet(performance.now())), SWIPE_LIFT_MS + 10);
    }

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      if (lift) clearTimeout(lift);
      swipeArrow.cancel();
    };
  }, []);
}
