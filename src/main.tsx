import React from "react";
import ReactDOM from "react-dom/client";
import { SessionGate } from "./components/SessionGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { platform, showMainWindow } from "./lib/bridge";
import { pause, setBlendHooks } from "./lib/audio";
import { startOutputWatch } from "./lib/outputDevices";
import { startMediaSession } from "./lib/mediaSession";
import { startSmtc } from "./lib/smtc";
import { startDesktopAppearance } from "./lib/desktopAppearance";
import { usesNativeMediaControls } from "./lib/desktopPlatform";
import { PipApp } from "./pip/PipApp";
import { startPipSync } from "./pip/pipSync";
import { useLocalLibrary } from "./stores/localLibrary";
import { applyAppearance, useSettings } from "./stores/settings";
import { MotionRoot } from "./components/MotionRoot";
import { refreshHtmlClasses, startHtmlClasses } from "./lib/htmlClasses";
import { finishBlend, nextBlendTarget, usePlayer } from "./stores/player";

applyAppearance(useSettings.getState());
useSettings.subscribe(applyAppearance);
startHtmlClasses();

const root = document.getElementById("root") as HTMLElement;
const isPip = new URLSearchParams(window.location.search).get("window") === "pip";

function mountPip() {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <PipApp />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

function mountMain() {
  setBlendHooks({ upNext: nextBlendTarget, onComplete: finishBlend });
  if (usesNativeMediaControls(platform)) startSmtc();
  else startMediaSession();
  if (platform === "linux") {
    startDesktopAppearance(() => {
      applyAppearance(useSettings.getState());
      refreshHtmlClasses();
    }).catch((error) =>
      console.warn(`[hushio] desktop appearance unavailable: ${String(error)}`),
    );
  }
  if (platform === "windows") {
    startOutputWatch({
      isPlaying: () => usePlayer.getState().playing,
      pinned: () => useSettings.getState().audioSinkId,
      pause,
      unpin: () => useSettings.getState().setAudioSinkId(""),
    });
  }
  void useLocalLibrary.getState().startupRescan();
  startPipSync();

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <MotionRoot>
          <SessionGate />
        </MotionRoot>
      </ErrorBoundary>
    </React.StrictMode>,
  );

  requestAnimationFrame(() => requestAnimationFrame(() => void showMainWindow()));
}

if (isPip) mountPip();
else mountMain();
