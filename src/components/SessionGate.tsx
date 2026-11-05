import { useEffect } from "react";
import App from "../App";
import { gateFor, peekOnboardingIntent } from "../lib/onboarding";
import { startGoogleAuth, useAuth } from "../stores/auth";
import { useSession } from "../stores/session";
import { LaunchIntro } from "./LaunchIntro";
import { Onboarding } from "./Onboarding";

export function SessionGate() {
  const sessionLoaded = useSession((store) => store.loaded);
  const onboardingDone = useSession((store) => store.onboardingDone);
  const freshInstall = useSession((store) => store.freshInstall);
  const authLoaded = useAuth((store) => store.loaded);
  const mode = useAuth((store) => store.account.mode);
  const intent = peekOnboardingIntent();

  useEffect(() => {
    const stop = startGoogleAuth();
    void useSession.getState().load();
    return stop;
  }, []);

  const ready = sessionLoaded && authLoaded;
  const gate = gateFor({ loaded: ready, onboardingDone, freshInstall, mode, intent });

  return (
    <>
      <LaunchIntro ready={ready} />
      {gate.kind === "loading" && <div aria-hidden="true" className="h-screen bg-base" />}
      {gate.kind === "onboarding" && <Onboarding initial={gate.initial} />}
      {gate.kind === "shell" && <App />}
    </>
  );
}
