import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { showMainWindow } from "./lib/bridge";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

requestAnimationFrame(() => requestAnimationFrame(() => void showMainWindow()));
