import { animate, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AppLogo } from "./AppLogo";
import { introDone, platform } from "../lib/bridge";
import { introFinished, introPlan, markIntroFinished, waitUntil } from "../lib/intro";
import {
  EASE_IN_OUT,
  EASE_OUT,
  INTRO_FLIGHT_EASE,
  INTRO_HOLD_MS,
  INTRO_LETTER_EASE,
  INTRO_POLL_MS,
  INTRO_POP_EASE,
  INTRO_READY_CAP_MS,
  INTRO_SETTLE_EASES,
  INTRO_TIMING,
  introFade,
  reducedMotion,
} from "../lib/motion";

const TARGET = "[data-intro-target]";
const WORDMARK = "Hushio";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function centre(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function flyTo(tile: HTMLElement, target: HTMLElement): Promise<void> {
  const from = tile.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.height === 0 || to.height === 0) return;
  const a = centre(from);
  const b = centre(to);
  target.style.visibility = "hidden";
  await animate(
    tile,
    { x: b.x - a.x, y: b.y - a.y, scale: to.height / from.height },
    { duration: INTRO_TIMING.flightDuration, ease: INTRO_FLIGHT_EASE },
  );
  target.style.visibility = "";
}

export function LaunchIntro({ ready }: { ready: boolean }) {
  const [active, setActive] = useState(() => !introFinished());
  const overlayRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    if (!active) return;
    let live = true;
    let breath: AnimationPlaybackControls | null = null;
    const finish = () => {
      if (!live) return;
      live = false;
      breath?.stop();
      setActive(false);
      markIntroFinished();
      void introDone().catch(() => {});
    };
    window.addEventListener("pointerdown", finish, true);
    window.addEventListener("keydown", finish, true);

    const run = async () => {
      const overlay = overlayRef.current;
      const ground = groundRef.current;
      const slider = sliderRef.current;
      const tile = tileRef.current;
      const word = wordRef.current;
      if (!overlay || !ground || !slider || !tile || !word) return;
      const reduce = reducedMotion();
      const letters = Array.from(word.querySelectorAll<HTMLElement>("[data-letter]"));

      if (reduce) {
        tile.style.opacity = "1";
        slider.style.transform = "translateX(0px)";
        for (const letter of letters) letter.style.opacity = "1";
        void animate(ground, { opacity: [0, 1] }, introFade);
      } else {
        const T = INTRO_TIMING;
        const oneShots: unknown[] = [
          animate(
            tile,
            { opacity: [0, 1, 1, 1, 1], scale: [0.72, 1.045, 0.985, 1.008, 1] },
            { duration: T.popDuration, delay: T.popDelay, ease: INTRO_POP_EASE, times: [0, 0.38, 0.58, 0.76, 1] },
          ),
          animate(ground, { opacity: [0, 0.999] }, { duration: T.groundDuration, delay: T.groundDelay, ease: EASE_OUT }),
          animate(
            slider,
            { x: [T.slideStart, T.slideMid, 0] },
            { duration: T.settleDuration, delay: T.settleDelay, times: [0, 0.5, 1], ease: INTRO_SETTLE_EASES },
          ),
          ...letters.map((letter, index) =>
            animate(
              letter,
              { y: [170, 0], opacity: [0, 1] },
              {
                duration: T.letterDuration,
                delay: T.letterStart + index * T.letterStep,
                ease: INTRO_LETTER_EASE,
              },
            ),
          ),
        ];
        breath = animate(
          tile,
          { y: [0, -2, 0] },
          { duration: T.breathDuration, delay: T.breathDelay, ease: EASE_IN_OUT, repeat: Infinity },
        );
        await Promise.all([
          waitUntil(() => readyRef.current, INTRO_READY_CAP_MS, INTRO_POLL_MS),
          Promise.race([Promise.all(oneShots.map((control) => Promise.resolve(control))), wait(T.oneShotCapMs)]),
        ]);
        if (!live) return;
        breath.stop();
        breath = null;
        tile.style.opacity = "1";
      }
      if (reduce) {
        await Promise.all([waitUntil(() => readyRef.current, INTRO_READY_CAP_MS, INTRO_POLL_MS), wait(INTRO_HOLD_MS)]);
      }
      if (!live) return;

      const target = document.querySelector<HTMLElement>(TARGET);
      const plan = introPlan({ reduce, platform, hasTarget: target !== null });
      if (plan.glide && target) {
        await Promise.all([
          flyTo(tile, target),
          animate(word, { opacity: [1, 0] }, { duration: INTRO_TIMING.flightDuration, ease: INTRO_FLIGHT_EASE }),
        ]);
      }
      if (!live) return;

      await animate(overlay, { opacity: [1, 0] }, introFade);
    };

    run().catch(() => {}).finally(finish);

    return () => {
      live = false;
      window.removeEventListener("pointerdown", finish, true);
      window.removeEventListener("keydown", finish, true);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div ref={overlayRef} data-tauri-drag-region className="fixed inset-0 z-[2147483647]">
      <div
        ref={groundRef}
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "var(--intro-ground)", opacity: 0 }}
      />
      <div className="relative grid h-full place-items-center">
        <div
          className="flex items-center"
          style={{ gap: `${INTRO_TIMING.wordGap}px` }}
          role="img"
          aria-label={WORDMARK}
        >
          <div ref={sliderRef} style={{ transform: `translateX(${INTRO_TIMING.slideStart}px)` }}>
            <div
              ref={tileRef}
              aria-hidden="true"
              className="grid h-24 w-24 place-items-center"
              style={{
                opacity: 0,
              }}
            >
              <AppLogo size={96} launch />
            </div>
          </div>
          <span
            ref={wordRef}
            aria-hidden="true"
            className="flex overflow-hidden text-[56px] font-semibold leading-none"
            style={{ color: "var(--intro-ink)", width: `${INTRO_TIMING.wordWidth}px` }}
          >
            {Array.from(WORDMARK).map((letter, index) => (
              <span key={index} data-letter className="inline-block" style={{ opacity: 0 }}>
                {letter}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
