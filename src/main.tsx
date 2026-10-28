import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { showMainWindow } from "./lib/bridge";
import { startMediaSession } from "./lib/mediaSession";
import { useLocalLibrary } from "./stores/localLibrary";
import { applyAppearance, useSettings } from "./stores/settings";

applyAppearance(useSettings.getState());
useSettings.subscribe(applyAppearance);
startMediaSession();
void useLocalLibrary.getState().startupRescan();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

requestAnimationFrame(() => requestAnimationFrame(() => void showMainWindow()));
