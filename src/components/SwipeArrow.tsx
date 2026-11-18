import { memo, useEffect, useRef } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import type { SwipeDir } from "../lib/swipe";
import { discPose, SIDEBAR_COMMIT_PX } from "../lib/swipeFeel";

const HIDDEN = -60;
const REST = 22;
const OVERSHOOT = 18;
const FADE_MS = 340;
const DISC_BASE_PX = 10;
const OPACITY_RUN = 36;
const EASE_TRACK = 0.64;
const EASE_LEAVE = 0.8;

function poseFor(progress: number, back: boolean, going: boolean) {
  return discPose(progress * SIDEBAR_COMMIT_PX, back, going);
}

export type ArrowControl = {
  track: (dir: SwipeDir, progress: number) => void;
  commit: () => void;
  cancel: () => void;
};

export const swipeArrow: ArrowControl = {
  track: () => {},
  commit: () => {},
  cancel: () => {},
};

function reducedMotion() {
  return (
    document.documentElement.classList.contains("reduce-motion") ||
    (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)
  );
}

export const SwipeArrow = memo(function SwipeArrow() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = root.current;
    if (!current) return;
    const node: HTMLDivElement = current;

    let dir: SwipeDir = "back";
    let at = HIDDEN;
    let to = HIDDEN;
    let scale = 1;
    let mode: "idle" | "track" | "leave" | "go" = "idle";
    let raf = 0;
    let lastFrame = 0;
    let fade: ReturnType<typeof setTimeout> | undefined;

    function paint() {
      const opacity = Math.min(1, Math.max(0, (at - HIDDEN) / OPACITY_RUN));
      node.style.transform = `translate3d(${dir === "back" ? at : -at}px, 0, 0) scale(${scale})`;
      node.style.opacity = String(opacity);
    }

    function clearFade() {
      if (fade) clearTimeout(fade);
      fade = undefined;
    }

    function hide() {
      cancelAnimationFrame(raf);
      clearFade();
      mode = "idle";
      at = HIDDEN;
      to = HIDDEN;
      scale = 1;
      paint();
      node.classList.remove("is-on", "is-armed", "is-go");
    }

    function frame(now: number) {
      const dt = Math.min(64, lastFrame ? now - lastFrame : 16.7);
      lastFrame = now;
      const rate = mode === "leave" ? EASE_LEAVE : EASE_TRACK;
      const k = reducedMotion() ? 1 : 1 - Math.pow(rate, dt / 16.7);
      at += (to - at) * k;
      if (Math.abs(to - at) < 0.1) at = to;
      paint();
      if (at === to) {
        raf = 0;
        lastFrame = 0;
        if (mode === "leave") hide();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function run() {
      if (raf) return;
      lastFrame = 0;
      raf = requestAnimationFrame(frame);
    }

    swipeArrow.track = (nextDir, progress) => {
      if (mode === "go") hide();
      if (nextDir !== dir) {
        dir = nextDir;
        node.dataset.dir = dir;
        at = HIDDEN;
      }
      mode = "track";
      const pose = poseFor(progress, dir === "back", false);
      to = progress > 0 ? REST + pose.offsetX - DISC_BASE_PX : HIDDEN;
      scale = pose.scale;
      node.classList.add("is-on");
      node.classList.toggle("is-armed", progress >= 1);
      run();
    };

    swipeArrow.commit = () => {
      if (mode === "idle") return;
      clearFade();
      mode = "go";
      to = Math.max(at, REST) + OVERSHOOT;
      scale = poseFor(1, dir === "back", true).scale;
      node.classList.add("is-on", "is-armed", "is-go");
      fade = setTimeout(hide, FADE_MS);
      run();
    };

    swipeArrow.cancel = () => {
      if (mode !== "track") return;
      clearFade();
      mode = "leave";
      to = HIDDEN;
      scale = 1;
      node.classList.remove("is-armed");
      run();
    };

    return () => {
      cancelAnimationFrame(raf);
      clearFade();
      swipeArrow.track = () => {};
      swipeArrow.commit = () => {};
      swipeArrow.cancel = () => {};
    };
  }, []);

  return (
    <div ref={root} className="swipe-arrow" data-dir="back" aria-hidden="true">
      <span className="swipe-arrow__ring" />
      <span className="swipe-arrow__bubble">
        <span className="swipe-arrow__icon swipe-arrow__icon--back">
          <Icon icon={CaretLeft} />
        </span>
        <span className="swipe-arrow__icon swipe-arrow__icon--forward">
          <Icon icon={CaretRight} />
        </span>
      </span>
    </div>
  );
});
