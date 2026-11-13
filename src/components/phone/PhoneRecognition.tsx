import { PlayIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { PhoneIcon } from "./PhoneIcon";
import type { useRecogniseSong } from "../RecogniseSong";

type Recognise = ReturnType<typeof useRecogniseSong>;

export function PhoneRecognition({ recognise }: { recognise: Recognise }) {
  const { status, match, message, play, search } = recognise;
  if (status === "listening") {
    return (
      <p role="status" className="text-[13px] leading-[18px] text-ink-2">
        Play the song out loud. It takes about ten seconds.
      </p>
    );
  }
  if (status === "empty") {
    return (
      <p role="status" className="text-[13px] leading-[18px] text-ink-2">
        {message || "No match found. Try again with the song playing louder."}
      </p>
    );
  }
  if (status === "error") {
    return (
      <p role="alert" className="text-[13px] leading-[18px] text-danger-text">
        {message}
      </p>
    );
  }
  if (status !== "found" || !match) return null;
  return (
    <section aria-label="Recognised song" className="flex items-center gap-3">
      {match.cover ? (
        <img src={match.cover} alt="" className="h-12 w-12 shrink-0 rounded-[6px] object-cover" />
      ) : (
        <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-[6px] bg-wash" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] leading-[22px] font-normal text-ink-1">{match.title}</p>
        <p className="truncate text-[13.5px] leading-[18px] text-ink-2">{match.artist}</p>
      </div>
      {match.videoId && (
        <button
          type="button"
          onClick={play}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] bg-wash px-3 text-[14px] font-medium text-ink-1 motion-safe:transition-colors active:bg-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <PhoneIcon icon={PlayIcon} size={24} />
          Play
        </button>
      )}
      <button
        type="button"
        aria-label="Search for this song"
        title="Search for this song"
        onClick={search}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-wash text-ink-1 motion-safe:transition-colors active:bg-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <PhoneIcon icon={Search01Icon} size={24} />
      </button>
    </section>
  );
}
