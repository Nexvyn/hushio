import type { ReactNode } from "react";
import { normalizeCredit } from "../lib/credits";

export const CREDITS_SOURCE = "Online catalogue";
const UNAVAILABLE = "Songwriter and producer credits are not available for this song.";

export function CreditsBlock({ song, action }: { song: { artist: string }; action?: ReactNode }) {
  const performer = normalizeCredit(song.artist);
  return (
    <section aria-label="Credits" className="pb-4">
      <div className="flex items-center justify-between gap-3 pr-4">
        <h3 className="px-4 pt-3 pb-1 text-meta font-semibold text-ink-1">Credits</h3>
        {action}
      </div>
      <dl className="flex flex-col">
        {performer && (
          <div className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-meta text-ink-2">Performed by</dt>
            <dd className="min-w-0 truncate text-right text-meta text-ink-1">{performer}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="shrink-0 text-meta text-ink-2">Source</dt>
          <dd className="min-w-0 truncate text-right text-meta text-ink-1">{CREDITS_SOURCE}</dd>
        </div>
      </dl>
      <p className="px-4 text-caption text-ink-2">{UNAVAILABLE}</p>
    </section>
  );
}
