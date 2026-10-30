import { useEffect, useRef, useState } from "react";
import { type DialogRequest, useUI } from "../stores/ui";

type Failure = { request: DialogRequest; message: string };

function commit(request: DialogRequest, value: string, fail: (message: string) => void, close: () => void) {
  const message = request.validate?.(value) ?? null;
  if (message !== null) {
    fail(message);
    return;
  }
  request.onConfirm(value);
  close();
}

export function Dialog() {
  const request = useUI((state) => state.dialog);
  const closeDialog = useUI((state) => state.closeDialog);
  const [failure, setFailure] = useState<Failure | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = request;
    if (!active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (!active) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        closeDialog();
        return;
      }
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          panel.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement;
        if (event.shiftKey && (current === first || !panel.contains(current))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== "Enter") return;
      if (active.multiline && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const value =
        active.initialValue !== undefined
          ? inputRef.current?.value ?? active.initialValue
          : "";
      commit(active, value, (message) => setFailure({ request: active, message }), closeDialog);
    }

    window.addEventListener("keydown", onKeyDown, true);
    const timer = setTimeout(() => {
      if (!active) return;
      if (inputRef.current) {
        inputRef.current.focus();
        if (active.initialValue !== undefined) inputRef.current.select();
      } else {
        panelRef.current?.focus();
      }
    }, 30);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clearTimeout(timer);
    };
  }, [request, closeDialog]);

  if (!request) return null;

  const hasInput = request.initialValue !== undefined;
  const confirm = () => {
    const value = hasInput ? inputRef.current?.value ?? request.initialValue ?? "" : "";
    commit(request, value, (message) => setFailure({ request, message }), closeDialog);
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-[120] grid place-items-center">
      <div
        className="absolute inset-0"
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))" }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        tabIndex={-1}
        className="glass-strong animate-pop-in relative w-[min(420px,calc(100vw-48px))] rounded-2xl p-6 outline-none"
      >
        <h2
          className={`font-display text-lg font-bold ${
            request.danger ? "text-danger-text" : "text-ink-1"
          }`}
        >
          {request.title}
        </h2>
        {request.body && (
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
            {request.body}
          </p>
        )}
        {request.initialValue !== undefined &&
          (request.multiline ? (
            <textarea
              ref={(node) => {
                inputRef.current = node;
              }}
              defaultValue={request.initialValue}
              placeholder={request.placeholder}
              rows={7}
              spellCheck={false}
              className="mt-4 w-full resize-none rounded-xl border border-separator bg-ink-1/[0.06] px-3.5 py-2.5 text-sm leading-relaxed text-ink-1 placeholder:text-ink-2 focus:border-accent"
            />
          ) : (
            <input
              ref={(node) => {
                inputRef.current = node;
              }}
              type="text"
              defaultValue={request.initialValue}
              placeholder={request.placeholder}
              aria-invalid={failure?.request === request || undefined}
              spellCheck={false}
              className="mt-4 h-10 w-full rounded-xl border border-separator bg-ink-1/[0.06] px-3.5 text-sm text-ink-1 placeholder:text-ink-2 focus:border-accent"
            />
          ))}
        {failure?.request === request && (
          <p role="alert" className="mt-2 text-[13px] text-danger-text">
            {failure.message}
          </p>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          {!request.notice && (
            <button
              type="button"
              onClick={closeDialog}
              className="h-9 rounded-xl px-4 text-[13px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink-1"
            >
              {request.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            type="button"
            onClick={confirm}
            className={`h-9 rounded-xl px-4 text-[13px] font-medium transition-[filter] hover:brightness-110 ${
              request.danger
                ? "bg-danger text-white"
                : "bg-accent text-on-accent"
            }`}
          >
            {request.confirmLabel ?? (request.danger ? "Delete" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
