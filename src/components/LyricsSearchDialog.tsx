import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { lyricsPick, lyricsSearch, type LyricsCandidate } from "../lib/bridge";
import { replaceLyrics } from "../lib/lyrics";
import type { Track } from "../types";

const CLOSE_LENGTH_SEC = 3;
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

type LyricsSearchDialogProps = {
  track: Track;
  duration: number;
  onClose: () => void;
  onPicked: () => void;
};

type LyricsSearchPanelProps = LyricsSearchDialogProps & {
  touch?: boolean;
};

export function formatLength(seconds: number | null): string {
  if (seconds === null) return "Length unknown";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function isCloseLength(candidate: number | null, wanted: number): boolean {
  return candidate !== null && wanted > 0 && Math.abs(candidate - wanted) <= CLOSE_LENGTH_SEC;
}

function messageOf(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function Result({ candidate, wanted, disabled, onChoose }: { candidate: LyricsCandidate; wanted: number; disabled: boolean; onChoose: () => void }) {
  const close = isCloseLength(candidate.duration, wanted);
  return (
    <button
      type="button"
      data-result
      disabled={disabled}
      onClick={onChoose}
      className={`block w-full rounded-xl px-3.5 py-3 text-left hover:bg-hover disabled:opacity-60 motion-safe:transition-colors ${FOCUS_RING}`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold text-ink-1">{candidate.title}</span>
        <span className={`shrink-0 text-[13px] tabular-nums ${close ? "font-semibold text-accent" : "text-ink-2"}`}>
          {formatLength(candidate.duration)}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[13px] text-ink-2">
        {candidate.artist}
        {candidate.album ? ` · ${candidate.album}` : ""}
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        <span className="rounded-full bg-ink-1/[0.08] px-2 py-0.5 text-ink-2">{candidate.synced ? "Synced" : "Plain text"}</span>
        {close && <span className="rounded-full bg-accent/[0.16] px-2 py-0.5 text-accent">Length match</span>}
      </span>
      {candidate.preview.map((line, index) => (
        <span key={index} className="mt-1 block truncate text-[13px] text-ink-2">
          {line}
        </span>
      ))}
    </button>
  );
}

export function LyricsSearchPanel({ track, duration, onClose, onPicked, touch = false }: LyricsSearchPanelProps) {
  const initial = `${track.artist} ${track.title}`.trim();
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<LyricsCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const latest = useRef(0);

  const search = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const request = ++latest.current;
    setSearching(true);
    setFailure(null);
    lyricsSearch(trimmed, duration > 0 ? duration : undefined)
      .then((found) => {
        if (request !== latest.current) return;
        setResults(found);
      })
      .catch((error: unknown) => {
        if (request !== latest.current) return;
        setResults(null);
        setFailure(messageOf(error, "Lyrics search failed. Try again."));
      })
      .finally(() => {
        if (request === latest.current) setSearching(false);
      });
  };

  useEffect(() => {
    search(initial);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    search(query);
  };

  const choose = (candidate: LyricsCandidate) => {
    if (picking) return;
    setPicking(true);
    setFailure(null);
    lyricsPick(track.id, candidate.provider, candidate.candidateId)
      .then((result) => {
        replaceLyrics(track.id, result);
        onPicked();
      })
      .catch((error: unknown) => {
        setFailure(messageOf(error, "Could not load those lyrics. Try another result."));
        setPicking(false);
      });
  };

  const moveFocus = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-result]"));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    buttons[Math.min(buttons.length - 1, Math.max(0, index + step))].focus();
  };

  const empty = results !== null && results.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 id="lyrics-search-title" className="font-display text-lg font-bold text-ink-1">
        Search lyrics
      </h2>
      <p className="mt-1 text-[13px] text-ink-2">Pick the lyrics that match this song.</p>
      <form onSubmit={submit} role="search" className="mt-4">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2">
            <Icon icon={Search01Icon} />
          </span>
          <input
            type="search"
            aria-label="Search lyrics"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            spellCheck={false}
            className={`w-full rounded-xl border border-separator bg-ink-1/[0.06] pl-10 pr-3.5 text-sm text-ink-1 placeholder:text-ink-2 focus-visible:border-accent focus-visible:bg-elevated ${touch ? "h-12" : "h-10"} ${FOCUS_RING}`}
          />
        </div>
      </form>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {searching && (
          <p role="status" aria-busy="true" className="px-1 py-6 text-center text-sm text-ink-2">
            Searching lyrics...
          </p>
        )}
        {!searching && failure && (
          <p role="alert" className="px-1 py-6 text-center text-sm text-danger-text">
            {failure}
          </p>
        )}
        {!searching && empty && !failure && (
          <p role="status" className="px-1 py-6 text-center text-sm text-ink-2">
            No lyrics found for that search. Try a different title or artist.
          </p>
        )}
        {!searching && results && results.length > 0 && (
          <ul aria-label="Lyrics results" onKeyDown={moveFocus} className="flex flex-col gap-1">
            {results.map((candidate) => (
              <li key={`${candidate.provider}-${candidate.candidateId}`}>
                <Result candidate={candidate} wanted={duration} disabled={picking} onChoose={() => choose(candidate)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-5 flex items-center justify-end">
        <button
          type="button"
          onClick={onClose}
          className={`hit-area rounded-xl px-4 font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink-1 ${touch ? "min-h-12 text-[15px]" : "h-9 text-[13px]"} ${FOCUS_RING}`}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function LyricsSearchDialog({ track, duration, onClose, onPicked }: LyricsSearchDialogProps) {
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div className="motion-safe:animate-fade-in fixed inset-0 z-[120] grid place-items-center">
      <div
        className="absolute inset-0"
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))" }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lyrics-search-title"
        className="glass-strong relative flex max-h-[min(640px,calc(100vh-48px))] w-[min(560px,calc(100vw-48px))] flex-col rounded-2xl p-6 outline-none motion-safe:animate-pop-in"
      >
        <LyricsSearchPanel track={track} duration={duration} onClose={onClose} onPicked={onPicked} />
      </div>
    </div>,
    document.body,
  );
}
