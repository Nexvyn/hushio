import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { showMainWindow } from "./lib/bridge";
import { applyAppearance, useSettings } from "./stores/settings";

applyAppearance(useSettings.getState());
useSettings.subscribe(applyAppearance);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

requestAnimationFrame(() => requestAnimationFrame(() => void showMainWindow()));
