import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { platform, showMainWindow } from "./lib/bridge";
import { pause, setBlendHooks } from "./lib/audio";
import { startOutputWatch } from "./lib/outputDevices";
import { startMediaSession } from "./lib/mediaSession";
import { useLocalLibrary } from "./stores/localLibrary";
import { applyAppearance, useSettings } from "./stores/settings";
import { finishBlend, nextBlendTarget, usePlayer } from "./stores/player";

applyAppearance(useSettings.getState());
useSettings.subscribe(applyAppearance);
setBlendHooks({ upNext: nextBlendTarget, onComplete: finishBlend });
startMediaSession();
if (platform === "windows") {
  startOutputWatch({
    isPlaying: () => usePlayer.getState().playing,
    pinned: () => useSettings.getState().audioSinkId,
    pause,
    unpin: () => useSettings.getState().setAudioSinkId(""),
  });
}
void useLocalLibrary.getState().startupRescan();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

requestAnimationFrame(() => requestAnimationFrame(() => void showMainWindow()));
