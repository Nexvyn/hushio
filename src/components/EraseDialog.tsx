import { useEffect, useId, useRef, useState } from "react";
import { APP_NAME } from "../lib/app";
import { platform } from "../lib/bridge";
import { deviceNoun } from "../lib/desktopPlatform";
import { runErase, type EraseOptions, type EraseStage, type EraseSteps } from "../lib/disconnect";
import { bridgeSteps, resetStoresAfterErase, useErase, type EraseMode } from "../stores/erase";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";

type Props = {
  steps?: EraseSteps;
  onErased?: () => void;
};

type Phase = "confirm" | "working" | "remote-failed" | "local-failed";

function copyFor(device: string): Record<EraseMode, { title: string; body: string; confirm: string; done: string }> {
  return {
    google: {
      title: `Disconnect and erase ${APP_NAME} data?`,
      body: `This signs ${APP_NAME} out of your Google account and erases ${APP_NAME}'s data on this ${device}. Your YouTube playlists stay unless you tick the first box. Downloaded songs stay on this ${device} unless you tick the second box.`,
      confirm: "Disconnect & erase",
      done: `Your ${APP_NAME} data was erased from this ${device} and your Google account.`,
    },
    guest: {
      title: "Erase all local data?",
      body: `This erases your library, settings, listening history and stats from this ${device}. It can't be undone.`,
      confirm: "Erase all local data",
      done: `Your ${APP_NAME} data was erased from this ${device}.`,
    },
    reset: {
      title: `Reset app data on this ${device}?`,
      body: `This erases your library, playlists, listening history and settings on this ${device}. Downloads and YouTube data are kept.`,
      confirm: "Reset app data",
      done: `App data was reset on this ${device}.`,
    },
  };
}

function optionsFor(mode: EraseMode, youtube: boolean, downloads: boolean): EraseOptions {
  if (mode === "google") return { scope: "account", deleteYoutubePlaylists: youtube, deleteDownloads: downloads };
  if (mode === "guest") return { scope: "computer", deleteYoutubePlaylists: false, deleteDownloads: downloads };
  return { scope: "reset", deleteYoutubePlaylists: false, deleteDownloads: false };
}

function remoteText(message: string) {
  return /sign[- ]in/i.test(message)
    ? "Google didn't accept the request. Sign in again, then retry."
    : "Couldn't reach Google. Your local data is untouched. Try again.";
}

const BUTTON =
  "hit-area h-9 rounded-xl px-4 text-meta font-medium transition-[opacity,colors] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-[var(--disabled-opacity)]";
const SECONDARY = `${BUTTON} text-ink-2 hover:bg-hover hover:text-ink-1`;
const DANGER = `${BUTTON} bg-danger text-white hover:opacity-90`;
const CHECKBOX = "hit-area h-4 w-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

type PanelProps = { mode: EraseMode; steps: EraseSteps; onErased: () => void };

function ErasePanel({ mode, steps, onErased }: PanelProps) {
  const close = useErase((state) => state.close);
  const device = deviceNoun(platform);
  const copy = copyFor(device)[mode];
  const titleId = useId();
  const bodyId = useId();
  const [phase, setPhase] = useState<Phase>("confirm");
  const [step, setStep] = useState("");
  const [youtube, setYoutube] = useState(false);
  const [downloads, setDownloads] = useState(false);
  const [message, setMessage] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    cancelRef.current?.focus();
    const returnFocus = opener.current;
    return () => returnFocus?.focus();
  }, []);

  function dismiss() {
    if (phase === "working") return;
    if (phase !== "confirm") void steps.resumeSync().catch(() => undefined);
    close();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !panel.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  async function run(options: EraseOptions, from: EraseStage) {
    setPhase("working");
    const outcome = await runErase(steps, options, from, setStep);
    if (outcome.ok) {
      useUI.getState().toast(copy.done, "info");
      close();
      onErased();
      return;
    }
    setMessage(outcome.message);
    setPhase(outcome.stage === "local" ? "local-failed" : "remote-failed");
  }

  const working = phase === "working";
  const options = optionsFor(mode, youtube, downloads);

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <div
        className="absolute inset-0"
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))" }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismiss();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="glass-strong relative w-[min(420px,calc(100vw-48px))] rounded-2xl p-6 outline-none motion-safe:animate-pop-in"
      >
        <h2 id={titleId} className="font-display text-lg font-bold text-danger-text">
          {working ? "Erasing…" : copy.title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-meta leading-relaxed text-ink-2">
          {working ? `Keep ${APP_NAME} open. This takes a moment.` : copy.body}
        </p>

        {phase === "confirm" && mode !== "reset" && (
          <div className="mt-4 space-y-2.5">
            {mode === "google" && (
              <label className="flex items-center gap-2.5 text-meta text-ink-1">
                <input
                  type="checkbox"
                  checked={youtube}
                  onChange={(event) => setYoutube(event.target.checked)}
                  className={CHECKBOX}
                />
                Also delete playlists {APP_NAME} created on YouTube
              </label>
            )}
            <label className="flex items-center gap-2.5 text-meta text-ink-1">
              <input
                type="checkbox"
                checked={downloads}
                onChange={(event) => setDownloads(event.target.checked)}
                className={CHECKBOX}
              />
              Also delete downloaded files
            </label>
          </div>
        )}

        {working && step && (
          <p role="status" aria-live="polite" className="mt-4 text-meta text-ink-2">
            {step}
          </p>
        )}

        {(phase === "remote-failed" || phase === "local-failed") && (
          <p role="alert" className="mt-4 text-meta text-danger-text">
            {phase === "local-failed"
              ? "Disconnected, but some local data could not be removed."
              : remoteText(message)}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={dismiss} disabled={working} className={SECONDARY}>
            Cancel
          </button>
          {phase === "confirm" && mode === "guest" && (
            <button
              type="button"
              onClick={() => {
                close();
                void useAuth.getState().signIn();
              }}
              className={SECONDARY}
            >
              Sign in with Google
            </button>
          )}
          {phase === "confirm" && (
            <button type="button" onClick={() => void run(options, "remote")} className={DANGER}>
              {copy.confirm}
            </button>
          )}
          {working && (
            <button type="button" disabled className={DANGER}>
              Erasing…
            </button>
          )}
          {phase === "remote-failed" && mode === "google" && (
            <button
              type="button"
              onClick={() => void run({ ...options, scope: "computer" }, "remote")}
              className={SECONDARY}
            >
              {`Erase this ${device} only`}
            </button>
          )}
          {phase === "remote-failed" && (
            <button type="button" onClick={() => void run(options, "remote")} className={DANGER}>
              Try again
            </button>
          )}
          {phase === "local-failed" && (
            <button type="button" onClick={() => void run(options, "local")} className={DANGER}>
              Retry local cleanup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EraseDialog({ steps, onErased = resetStoresAfterErase }: Props) {
  const mode = useErase((state) => state.mode);
  if (!mode) return null;
  return <ErasePanel key={mode} mode={mode} steps={steps ?? bridgeSteps()} onErased={onErased} />;
}
