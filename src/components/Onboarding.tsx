import { useEffect, useReducer, type ReactNode } from "react";
import { motion } from "motion/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Album01Icon,
  ArrowRight01Icon,
  GoogleIcon,
  HardDriveIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { CaptionButtons } from "./CaptionButtons";
import { CoverDrum } from "./CoverDrum";
import { Icon } from "./Icon";
import { googleSignIn, platform, type GoogleAccount } from "../lib/bridge";
import { hasCaptionButtons } from "../lib/desktopPlatform";
import { glide } from "../lib/motion";
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Onboarding({ initial }: OnboardingProps) {
  const [state, dispatch] = useReducer(onboardingReducer, initial, initialOnboarding);
  useEffect(() => {
    takeOnboardingIntent();
  }, []);
  const completeOnboarding = useSession((store) => store.completeOnboarding);
  const progress = useSync((store) => store.status);

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

  const syncing = state.screen === "restoring" && !state.syncDone;
  const direction = state.dir === "fwd" ? 40 : -40;

  return (
    <div className="fixed inset-0 flex flex-col bg-base text-ink-1">
      <div data-tauri-drag-region className="flex h-14 shrink-0 items-center justify-end">
        {hasCaptionButtons(platform) && <CaptionButtons />}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <section className="flex min-h-0 flex-col justify-center gap-6 px-10 pb-10">
          <div className="flex items-center gap-3 text-[15px] font-semibold">
            <span aria-hidden="true" className="inline-flex rounded-xl bg-wash p-2 text-ink-1">
              <Icon icon={Album01Icon} />
            </span>
            Hushio
          </div>
          <motion.div
            key={state.screen}
            initial={{ opacity: 0, x: direction }}
            animate={{ opacity: 1, x: 0 }}
            transition={glide}
            className="flex max-w-md flex-col gap-5"
          >
            {state.screen === "choose" && (
              <ChooseStep state={state} onGoogle={() => void signInWithGoogle()} onGuest={() => void completeOnboarding()} />
            )}
            {state.screen === "resume" && (
              <ResumeStep state={state} onGuest={continueAsGuest} onGoogle={continueWithGoogleFromResume} />
            )}
            {state.screen === "restoring" && (
              <RestoringStep
                state={state}
                progressText={syncing && progress.state === "running" && progress.total > 0
                  ? `Saving to YouTube: ${progress.done} / ${progress.total}`
                  : null}
                onContinue={() => void completeOnboarding()}
              />
            )}
          </motion.div>
        </section>
        <div className="hidden items-center justify-center md:flex">
          <CoverDrum turn={state.turn} spinning={syncing} />
        </div>
      </div>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h1 className="text-[32px] font-semibold leading-tight">{children}</h1>;
}

function Lede({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-ink-2">{children}</p>;
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] text-danger-text">
      {message}
    </p>
  );
}

type WayProps = {
  icon: IconSvgElement;
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
      className="flex h-16 w-full items-center gap-3 rounded-2xl border border-separator bg-panel px-4 text-left hover:bg-hover disabled:opacity-[var(--disabled-opacity)]"
    >
      <span aria-hidden="true" className="inline-flex text-ink-1">
        <Icon icon={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold">{title}</span>
        <span className="truncate text-[12.5px] text-ink-2">{note}</span>
      </span>
      <span aria-hidden="true" className={`inline-flex text-ink-2 ${busy ? "bt-spin" : ""}`}>
        <Icon icon={busy ? Loading03Icon : ArrowRight01Icon} />
      </span>
    </button>
  );
}

function ChooseStep({
  state,
  onGoogle,
  onGuest,
}: {
  state: OnboardingState;
  onGoogle: () => void;
  onGuest: () => void;
}) {
  return (
    <>
      <Heading>
        <span className="block">Stream what&apos;s new.</span>
        <span className="block text-ink-2">Play what&apos;s yours.</span>
      </Heading>
      <Lede>Free and open source. Play as a guest, or sign in with Google to sync.</Lede>
      <ul className="flex flex-col gap-2">
        <li>
          <Way
            icon={GoogleIcon}
            title="Continue with Google"
            note={state.busy ? "Finish in your browser" : "Sync your playlists and liked songs with your YouTube account"}
            busy={state.busy}
            disabled={state.busy}
            onClick={onGoogle}
          />
        </li>
        <li>
          <Way
            icon={HardDriveIcon}
            title="Continue as guest"
            note="Everything stays on this computer"
            disabled={state.busy}
            onClick={onGuest}
          />
        </li>
      </ul>
      <ErrorLine message={state.error} />
    </>
  );
}

function ResumeStep({
  state,
  onGuest,
  onGoogle,
}: {
  state: OnboardingState;
  onGuest: () => void;
  onGoogle: () => void;
}) {
  return (
    <>
      <Heading>Your guest library is still here</Heading>
      <Lede>We found it on this computer, from an earlier install.</Lede>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={state.busy}
          onClick={onGuest}
          className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-[14px] font-medium text-on-primary disabled:opacity-[var(--disabled-opacity)]"
        >
          {state.busy ? "Starting…" : "Continue as guest"}
        </button>
        <button
          type="button"
          disabled={state.busy}
          onClick={onGoogle}
          className="inline-flex h-10 items-center rounded-xl bg-wash px-4 text-[14px] font-medium text-ink-1 hover:bg-hover disabled:opacity-[var(--disabled-opacity)]"
        >
          Continue with Google
        </button>
      </div>
      <ErrorLine message={state.error} />
      <p className="text-[12.5px] text-ink-3">Signing in later carries it over. Nothing is deleted.</p>
    </>
  );
}

function RestoringStep({
  state,
  progressText,
  onContinue,
}: {
  state: OnboardingState;
  progressText: string | null;
  onContinue: () => void;
}) {
  return (
    <>
      <Heading>Syncing your library</Heading>
      <Lede>
        Your YouTube playlists and liked music are coming to this computer.
      </Lede>
      <p role="status" className="flex items-center gap-2 text-[13px] text-ink-2">
        {state.syncDone ? (
          state.syncError ?? "Synced"
        ) : (
          <>
            <span aria-hidden="true" className="bt-spin inline-flex">
              <Icon icon={Loading03Icon} />
            </span>
            {progressText ?? "Syncing"}
          </>
        )}
      </p>
      <button
        type="button"
        disabled={!state.syncDone}
        onClick={onContinue}
        className="inline-flex h-10 w-fit items-center rounded-xl bg-primary px-4 text-[14px] font-medium text-on-primary disabled:opacity-[var(--disabled-opacity)]"
      >
        Continue
      </button>
    </>
  );
}
