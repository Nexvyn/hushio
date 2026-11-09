import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { errorMessage, updateCopy, type UpdatePhase } from "../../lib/appUpdate";
import {
  listenPlayerEvent,
  updateCheck,
  updateDownload,
  updateInstall,
  updateOpenInstallSettings,
  type UpdateCheck,
} from "../../lib/bridge";

type Offer = Extract<UpdateCheck, { state: "available" }>;

export function AndroidUpdateControl({ current }: { current: string | null }) {
  const [phase, setPhase] = useState<UpdatePhase>({ kind: "idle" });
  const offer = useRef<Offer | null>(null);
  const downloaded = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    listenPlayerEvent<{ percent: number }>("update-progress", ({ percent }) => {
      setPhase((current) => (current.kind === "downloading" ? { ...current, percent } : current));
    }).then((unlisten) => {
      if (live) stop = unlisten;
      else unlisten();
    });
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  async function check() {
    if (!current) return;
    setPhase({ kind: "checking" });
    try {
      const result = await updateCheck(current);
      if (result.state === "available") {
        offer.current = result;
        setPhase({ kind: "available", version: result.version });
      } else if (result.state === "current") {
        setPhase({ kind: "current", version: result.version });
      } else {
        setPhase({ kind: "error", during: "check", message: result.message });
      }
    } catch (error) {
      setPhase({ kind: "error", during: "check", message: errorMessage(error) });
    }
  }

  async function download() {
    const target = offer.current;
    if (!target) return;
    setPhase({ kind: "downloading", version: target.version, percent: 0 });
    try {
      const { path } = await updateDownload(target);
      downloaded.current = path;
      setPhase({ kind: "ready", version: target.version });
    } catch (error) {
      setPhase({ kind: "error", during: "update", message: errorMessage(error) });
    }
  }

  async function install() {
    const path = downloaded.current;
    if (!path) return;
    try {
      const result = await updateInstall(path);
      if (result.state === "unknown_sources") setPhase({ kind: "unknown-sources" });
    } catch (error) {
      setPhase({ kind: "error", during: "update", message: errorMessage(error) });
    }
  }

  const copy = updateCopy(phase, current);
  const busy = phase.kind === "checking" || phase.kind === "downloading";

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      {copy ? (
        <p className="text-[13px] text-ink-1" aria-live="polite">
          {copy.title}
          {copy.note ? <span className="block text-ink-3">{copy.note}</span> : null}
        </p>
      ) : null}
      {phase.kind === "available" ? (
        <Button className="min-h-[44px] min-w-[44px]" onClick={() => void download()}>
          Update
        </Button>
      ) : phase.kind === "ready" ? (
        <Button className="min-h-[44px] min-w-[44px]" onClick={() => void install()}>
          Install
        </Button>
      ) : phase.kind === "unknown-sources" ? (
        <Button className="min-h-[44px] min-w-[44px]" onClick={() => void updateOpenInstallSettings()}>
          Open settings
        </Button>
      ) : (
        <Button className="min-h-[44px] min-w-[44px]" disabled={busy || !current} onClick={() => void check()}>
          {phase.kind === "checking" ? "Checking…" : "Check for updates"}
        </Button>
      )}
    </div>
  );
}
