import { useState } from "react";
import { Mic01Icon, PlayIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { recogniseSong, type RecognitionMatch } from "../lib/bridge";
import { submitSearch } from "../lib/searchActions";
import { usePlayer } from "../stores/player";

export type RecogniseStatus = "idle" | "listening" | "found" | "empty" | "error";

export function useRecogniseSong() {
  const [status, setStatus] = useState<RecogniseStatus>("idle");
  const [match, setMatch] = useState<RecognitionMatch | null>(null);
  const [message, setMessage] = useState("");

  const start = async () => {
    setStatus("listening");
    setMatch(null);
    setMessage("");
    try {
      const found = await recogniseSong();
      setMatch(found);
      setStatus("found");
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "Couldn't listen.";
      setMessage(reason);
      setStatus(reason.toLowerCase().includes("no match") ? "empty" : "error");
    }
  };

  const play = () => {
    if (!match) return;
    usePlayer.getState().playQueue([
      { id: match.videoId ?? match.title, title: match.title, artist: match.artist, thumb: match.cover },
    ]);
  };

  const search = () => {
    if (!match) return;
    submitSearch(`${match.artist} ${match.title}`);
  };

  return { status, match, message, start, play, search };
}

export function RecogniseSong() {
  const { status, match, message, start, play, search } = useRecogniseSong();

  return (
    <section aria-label="Recognise a song" className="rounded-[11px] border border-separator bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={status === "listening"}
          className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-accent px-4 text-[14px] font-medium text-on-accent motion-safe:transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)]"
        >
          <Icon icon={Mic01Icon} />
          {status === "listening" ? "Listening…" : "Recognise song"}
        </button>
        {status === "listening" && (
          <span role="status" className="text-[13px] text-ink-2">
            Play the song out loud. It takes about ten seconds.
          </span>
        )}
        {status === "empty" && (
          <span role="status" className="text-[13px] text-ink-2">
            {message || "No match found. Try again with the song playing louder."}
          </span>
        )}
        {status === "error" && (
          <span role="alert" className="text-[13px] text-danger-text">
            {message}
          </span>
        )}
      </div>

      {status === "found" && match && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {match.cover ? (
            <img src={match.cover} alt="" className="size-14 shrink-0 rounded-[9px] object-cover" />
          ) : (
            <span aria-hidden="true" className="size-14 shrink-0 rounded-[9px] bg-wash" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-ink-1">{match.title}</p>
            <p className="truncate text-[13px] text-ink-2">{match.artist}</p>
            {match.album && <p className="truncate text-[12px] text-ink-2">{match.album}</p>}
          </div>
          <div className="flex items-center gap-2">
            {match.videoId && (
              <button
                type="button"
                onClick={play}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-wash px-4 text-[14px] font-medium text-ink-1 motion-safe:transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Icon icon={PlayIcon} />
                Play
              </button>
            )}
            <button
              type="button"
              onClick={search}
              className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-wash px-4 text-[14px] font-medium text-ink-1 motion-safe:transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Icon icon={Search01Icon} />
              Search
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
