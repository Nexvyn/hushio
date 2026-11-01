import { useEffect, useId, useRef, useState } from "react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { copyReplayCard, renderReplayCard, type ReplayCardInput } from "../lib/replayCard";
import { useUI } from "../stores/ui";

type ReplayShareSheetProps = {
  card: ReplayCardInput;
  onClose: () => void;
};

export function ReplayShareSheet({ card, onClose }: ReplayShareSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const copy = async () => {
    if (!blob) return;
    try {
      await copyReplayCard(blob);
      setCopied(true);
      useUI.getState().toast("Copied — paste it into a story or a chat", "success");
    } catch {
      useUI.getState().toast("Couldn't copy the card", "error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6"
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
        className="flex max-h-full w-full max-w-[420px] flex-col gap-4 overflow-y-auto rounded-[16px] bg-panel p-5 focus:outline-none"
      >
        <h2 id={titleId} className="text-[17px] font-semibold text-ink-1">
          Share your Replay
        </h2>
        <p className="text-[12.5px] text-ink-2">
          Your minutes, your top songs and artists, and your top song's record — one card, sized for a story.
        </p>
        <div className="mx-auto w-full max-w-[240px]">
          {preview ? (
            <img
              src={preview}
              alt="Your Replay card"
              className="block aspect-[9/16] w-full rounded-[11px] outline outline-1 -outline-offset-1 outline-black/10 [[data-theme=dark]_&]:outline-white/10"
            />
          ) : (
            !failed && <div aria-hidden="true" className="aspect-[9/16] w-full motion-safe:animate-pulse rounded-[11px] bg-wash" />
          )}
        </div>
        {failed && (
          <p role="alert" className="text-center text-[12.5px] text-danger-text">
            The card couldn't be drawn. Close this and try again.
          </p>
        )}
        <p className="text-center text-[12px] text-ink-2">
          A 1080 × 1920 picture, sized for a story. Copy it into a chat, or paste it into a story.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" className="gap-2" disabled={!blob} onClick={() => void copy()}>
            <Icon icon={copied ? Tick02Icon : Copy01Icon} />
            {copied ? "Copied" : "Copy image"}
          </Button>
        </div>
      </div>
    </div>
  );
}
