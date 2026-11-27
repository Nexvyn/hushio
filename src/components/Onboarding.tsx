import { useEffect, useReducer, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { CaretRight, GoogleLogo, CircleNotch, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { CaptionButtons } from "./CaptionButtons";
import { Icon } from "./Icon";
import { AppLogo } from "./AppLogo";
import { googleSignIn, platform, type GoogleAccount } from "../lib/bridge";
import { deviceNoun, hasCaptionButtons } from "../lib/desktopPlatform";
import { DURATION_MS, EASE_OUT } from "../lib/motion";
import { onboardingLayout, PHONE_BREAKPOINT, type OnboardingFrame, type OnboardingLayout } from "../lib/onboardingLayout";
import {
  initialOnboarding,
  isCancelledSignIn,
  takeOnboardingIntent,
  onboardingReducer,
  type OnboardingState,
  type Screen,
} from "../lib/onboarding";
import { useAuth } from "../stores/auth";
import { useSession } from "../stores/session";
import { useSync } from "../stores/sync";

type OnboardingProps = { initial: Screen };

type SyncStatus = ReturnType<typeof useSync.getState>["status"];

type StepView = {
  screen: Screen;
  title: string[];
  subtitle: string;
  centre: ReactNode;
  primary: { label: string; disabled: boolean; onClick: () => void };
  caption: string | null;
};

const stepIn = { duration: DURATION_MS.pageIn / 1000, ease: EASE_OUT };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useViewport(): OnboardingFrame {
  const [frame, setFrame] = useState<OnboardingFrame>(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setFrame({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return frame;
}

export function Onboarding({ initial }: OnboardingProps) {
  const [state, dispatch] = useReducer(onboardingReducer, initial, initialOnboarding);
  useEffect(() => {
    takeOnboardingIntent();
  }, []);
  const completeOnboarding = useSession((store) => store.completeOnboarding);
  const progress = useSync((store) => store.status);
  const frame = useViewport();

  async function firstSync() {
    await useSync.getState().syncNow();
    dispatch({ type: "syncFinished", error: useSync.getState().status.lastError });
  }

  async function signInWithGoogle() {
    dispatch({ type: "googleStart" });
    let account: GoogleAccount;
    try {
      account = await googleSignIn();
    } catch (error) {
      const message = errorMessage(error);
      dispatch(isCancelledSignIn(message) ? { type: "googleCancelled" } : { type: "googleFailed", message });
      return;
    }
    useAuth.getState().apply(account);
    dispatch({ type: "googleSignedIn" });
    await firstSync();
  }

  function continueAsGuest() {
    dispatch({ type: "guestStart" });
    void completeOnboarding();
  }

  function continueWithGoogleFromResume() {
    dispatch({ type: "resumeToChoose" });
    void signInWithGoogle();
  }

  const view = stepView(state, progress, {
    google: () => void signInWithGoogle(),
    guest: () => void completeOnboarding(),
    resumeGuest: continueAsGuest,
    resumeGoogle: continueWithGoogleFromResume,
  });
  const dir = state.dir === "fwd" ? 1 : -1;

  if (frame.width < PHONE_BREAKPOINT) {
    return <PhoneOnboarding view={view} dir={dir} layout={onboardingLayout(frame)} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-base text-ink-1">
      <div data-tauri-drag-region className="flex h-14 shrink-0 items-center justify-end">
        {hasCaptionButtons(platform) && <CaptionButtons />}
      </div>
      <section className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col justify-center gap-6 px-10 pb-10">
        <div className="flex items-center gap-3 text-body font-semibold">
          <AppLogo size={40} />
          Hushio
        </div>
        <motion.div
          key={view.screen}
          initial={{ opacity: 0, x: 12 * dir }}
          animate={{ opacity: 1, x: 0 }}
          transition={stepIn}
          className="flex flex-col gap-5"
        >
          <Title lines={view.title} />
          <p className="text-body text-ink-2">{view.subtitle}</p>
          {view.centre}
          <button
            type="button"
            disabled={view.primary.disabled}
            onClick={view.primary.onClick}
            className="inline-flex h-10 w-fit items-center rounded-xl bg-primary px-4 text-body font-medium text-on-primary disabled:opacity-[var(--disabled-opacity)]"
          >
            {view.primary.label}
          </button>
          {view.caption && <p className="text-meta text-ink-3">{view.caption}</p>}
        </motion.div>
      </section>
    </div>
  );
}

function stepView(
  state: OnboardingState,
  progress: SyncStatus,
  actions: { google: () => void; guest: () => void; resumeGuest: () => void; resumeGoogle: () => void },
): StepView {
  if (state.screen === "resume") {
    return {
      screen: "resume",
      title: ["Your guest library is still here"],
      subtitle: `We found it on this ${deviceNoun(platform)}, from an earlier install.`,
      centre: (
        <>
          <ul className="flex flex-col gap-2">
            <li>
              <Way
                icon={GoogleLogo}
                title="Continue with Google"
                note="Sync your playlists and liked songs with your YouTube account"
                disabled={state.busy}
                onClick={actions.resumeGoogle}
              />
            </li>
          </ul>
          <ErrorLine message={state.error} />
        </>
      ),
      primary: { label: "Continue as guest", disabled: state.busy, onClick: actions.resumeGuest },
      caption: "Signing in later carries it over. Nothing is deleted.",
    };
  }
  if (state.screen === "restoring") {
    const progressText =
      !state.syncDone && progress.state === "running" && progress.total > 0
        ? `Saving to YouTube: ${progress.done} / ${progress.total}`
        : null;
    return {
      screen: "restoring",
      title: ["Syncing your library"],
      subtitle: `Your YouTube playlists and liked music are coming to this ${deviceNoun(platform)}.`,
      centre: (
        <p role="status" className="flex items-center gap-2 text-meta text-ink-2">
          {state.syncDone ? (
            state.syncError ?? "Synced"
          ) : (
            <>
              <span aria-hidden="true" className="bt-spin inline-flex">
                <Icon icon={CircleNotch} />
              </span>
              {progressText ?? "Syncing"}
            </>
          )}
        </p>
      ),
      primary: { label: "Continue", disabled: !state.syncDone, onClick: actions.guest },
      caption: null,
    };
  }
  return {
    screen: "choose",
    title: ["Stream what's new.", "Play what's yours."],
    subtitle: "Free and open source. Play as a guest, or sign in with Google to sync.",
    centre: (
      <>
        <ul className="flex flex-col gap-2">
          <li>
            <Way
              icon={GoogleLogo}
              title="Continue with Google"
              note={state.busy ? "Finish in your browser" : "Sync your playlists and liked songs with your YouTube account"}
              busy={state.busy}
              disabled={state.busy}
              onClick={actions.google}
            />
          </li>
        </ul>
        <ErrorLine message={state.error} />
      </>
    ),
    primary: { label: "Continue as guest", disabled: state.busy, onClick: actions.guest },
    caption: "Google sync is optional. Guest keeps everything on this device.",
  };
}

function Title({ lines }: { lines: string[] }) {
  return (
    <h1 className="text-[32px] font-semibold leading-tight">
      {lines.map((line, index) => (
        <span key={line} className={`block ${index > 0 ? "text-ink-2" : ""}`}>
          {line}
        </span>
      ))}
    </h1>
  );
}

function PhoneOnboarding({ view, dir, layout }: { view: StepView; dir: number; layout: OnboardingLayout }) {
  const fromTop = (y: number) => `calc(env(safe-area-inset-top, 0px) + ${y}px)`;
  const fromBottom = (y: number) => `calc(${y}px - env(safe-area-inset-bottom, 0px))`;
  const rowVars = {
    "--onboarding-row": `${52 * layout.scale}px`,
    "--onboarding-pad": `${18 * layout.scale}px`,
  } as CSSProperties;
  return (
    <div className="fixed inset-0 overflow-hidden bg-base text-ink-1">
      <motion.div
        key={view.screen}
        initial={{ opacity: 0, x: 12 * dir }}
        animate={{ opacity: 1, x: 0 }}
        transition={stepIn}
        className="pointer-events-none absolute inset-0"
      >
        <h1
          className="absolute inset-x-0 text-center font-semibold text-balance"
          style={{
            top: fromTop(layout.title.top),
            paddingInline: layout.side,
            fontSize: layout.title.size,
            lineHeight: layout.title.lineHeight,
          }}
        >
          {view.title.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        <p
          className="absolute inset-x-0 text-center text-ink-2"
          style={{ top: fromTop(layout.subtitle.top), paddingInline: layout.side, fontSize: layout.subtitle.size }}
        >
          {view.subtitle}
        </p>
        <div
          className="pointer-events-auto absolute inset-x-0 flex flex-col justify-center"
          style={{
            top: fromTop(layout.centre.top),
            height: layout.centre.height,
            paddingInline: layout.side,
            gap: 8 * layout.scale,
            ...rowVars,
          }}
        >
          {view.centre}
        </div>
        {view.caption && (
          <p
            className="absolute inset-x-0 text-center text-ink-2"
            style={{ top: fromBottom(layout.caption.top), paddingInline: layout.side, fontSize: layout.caption.size }}
          >
            {view.caption}
          </p>
        )}
      </motion.div>
      <button
        type="button"
        disabled={view.primary.disabled}
        onClick={view.primary.onClick}
        className="absolute rounded-xl bg-primary font-medium text-on-primary disabled:opacity-[var(--disabled-opacity)]"
        style={{
          top: fromBottom(layout.action.top),
          left: layout.side,
          right: layout.side,
          height: layout.action.height,
          fontSize: 17 * layout.scale,
        }}
      >
        {view.primary.label}
      </button>
    </div>
  );
}

type WayProps = {
  icon: PhosphorIcon;
  title: string;
  note: string;
  busy?: boolean;
  disabled: boolean;
  onClick: () => void;
};

function Way({ icon, title, note, busy = false, disabled, onClick }: WayProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-[var(--onboarding-row,3.5rem)] w-full items-center gap-3 rounded-xl px-[var(--onboarding-pad,0.75rem)] text-left hover:bg-hover disabled:opacity-[var(--disabled-opacity)]"
    >
      <span aria-hidden="true" className="inline-flex text-ink-1">
        <Icon icon={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-semibold">{title}</span>
        <span className="truncate text-meta text-ink-2">{note}</span>
      </span>
      <span aria-hidden="true" className={`inline-flex text-ink-2 ${busy ? "bt-spin" : ""}`}>
        <Icon icon={busy ? CircleNotch : CaretRight} />
      </span>
    </button>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-meta text-danger-text">
      {message}
    </p>
  );
}
