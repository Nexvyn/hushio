import { animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AppLogo } from "./AppLogo";
import { introDone } from "../lib/bridge";
import { introFinished, markIntroFinished, waitUntil } from "../lib/intro";
import { DURATION_MS, EASE_OUT, INTRO_POLL_MS, INTRO_READY_CAP_MS, introFade, reducedMotion } from "../lib/motion";

const WORDMARK = "Hushio";
const fadeIn = { duration: DURATION_MS.pageIn / 1000, ease: EASE_OUT };


export function LaunchIntro({ ready }: { ready: boolean }) {
  const [active, setActive] = useState(() => !introFinished());
  const overlayRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const lockupRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    if (!active) return;
    let live = true;
    const finish = () => {
      if (!live) return;
      live = false;
      setActive(false);
      markIntroFinished();
      void introDone().catch(() => {});
    };
    window.addEventListener("pointerdown", finish, true);
    window.addEventListener("keydown", finish, true);

    const run = async () => {
      const overlay = overlayRef.current;
      const ground = groundRef.current;
      const lockup = lockupRef.current;
      if (!overlay || !ground || !lockup) return;
      if (reducedMotion()) {
        ground.style.opacity = "1";
        lockup.style.opacity = "1";
        await waitUntil(() => readyRef.current, INTRO_READY_CAP_MS, INTRO_POLL_MS);
      } else {
        void animate(ground, { opacity: [0, 1] }, introFade);
        await Promise.all([
          animate(lockup, { opacity: [0, 1] }, fadeIn),
          waitUntil(() => readyRef.current, INTRO_READY_CAP_MS, INTRO_POLL_MS),
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
    <div ref={overlayRef} className="pointer-events-none fixed inset-0 z-[2147483647]">
      <div
        ref={groundRef}
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "var(--intro-ground)", opacity: 0 }}
      />
      <div className="relative grid h-full place-items-center">
        <div ref={lockupRef} className="flex items-center gap-3.5" role="img" aria-label={WORDMARK} style={{ opacity: 0 }}>
          <AppLogo size={96} launch />
          <span aria-hidden="true" className="text-[56px] font-semibold leading-none" style={{ color: "var(--intro-ink)" }}>
            {WORDMARK}
          </span>
        </div>
      </div>
    </div>
  );
}
