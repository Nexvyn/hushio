import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, DownloadSimple, Check } from "@phosphor-icons/react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { platform } from "../lib/bridge";
import { copyReplayCard, renderReplayCard, saveReplayCard, type ReplayCardInput } from "../lib/replayCard";
import { useUI } from "../stores/ui";

type ReplayShareSheetProps = {
  card: ReplayCardInput;
  onClose: () => void;
  zClass?: string;
};

export function ReplayShareSheet({ card, onClose, zClass = "z-50" }: ReplayShareSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const android = platform === "android";

  useEffect(() => {
    let live = true;
    renderReplayCard(card).then(
      (rendered) => {
        if (live) setBlob(rendered);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [card]);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  useEffect(() => {
    sheetRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const act = async () => {
    if (!blob) return;
    try {
      if (android) saveReplayCard(blob);
      else await copyReplayCard(blob);
      setDone(true);
      useUI.getState().toast(android ? "Card saved to Downloads" : "Copied — paste it into a story or a chat", "success");
    } catch {
      useUI.getState().toast(android ? "Couldn't save the card" : "Couldn't copy the card", "error");
    }
  };

  const sheet = (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-scrim p-6`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-[420px] flex-col gap-4 overflow-y-auto rounded-[16px] bg-panel p-5 focus-visible:outline-none"
      >
        <h2 id={titleId} className="text-card-title font-semibold text-ink-1">
          Share your Replay
        </h2>
        <p className="text-meta text-ink-2">
          Your minutes, your top songs and artists, and your top song's record. One card, sized for a story.
        </p>
        <div className="mx-auto w-full max-w-[240px]">
          {preview ? (
            <img loading="lazy" decoding="async"
              src={preview}
              alt="Your Replay card"
              className="block aspect-[9/16] w-full rounded-[11px] outline outline-1 -outline-offset-1 outline-black/10 [[data-theme=dark]_&]:outline-white/10"
            />
          ) : (
            !failed && <div aria-hidden="true" className="aspect-[9/16] w-full bt-skeleton rounded-[11px] bg-wash" />
          )}
        </div>
        {failed && (
          <p role="alert" className="text-center text-meta text-danger-text">
            The card couldn't be drawn. Close this and try again.
          </p>
        )}
        <p className="text-center text-meta text-ink-2">
          A 1080 × 1920 picture, sized for a story.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" className="gap-2" disabled={!blob} onClick={() => void act()}>
            <Icon icon={done ? Check : android ? DownloadSimple : Copy} />
            {android ? (done ? "Saved" : "Save image") : done ? "Copied" : "Copy image"}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
