import { useEffect } from "react";
import App from "../App";
import { introDone } from "../lib/bridge";
import { startGoogleAuth } from "../stores/auth";

export function SessionGate() {
  useEffect(() => {
    const stop = startGoogleAuth();
    void introDone().catch(() => {});
    return stop;
  }, []);

  return <App />;
}
