import type { IconSvgElement } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";
import { type MenuSource, openMenuAtPointer } from "./ContextMenu";
import { Icon } from "./Icon";
const COVER_MENU =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-separator bg-surface/90 text-ink-1 shadow-[var(--shadow-chip)] motion-safe:transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export const STACK_GRID = "grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4";

const FAN = [
  "z-30",
  "z-20 translate-x-[6%] -translate-y-[6%] scale-[0.9]",
  "z-10 -translate-x-[6%] -translate-y-[3%] scale-[0.8]",
];

type CoverStackProps = {
  title: string;
  subtitle: string;
  covers: string[];
  fallback: IconSvgElement;
  onOpen: () => void;
  onPlay?: () => void;
  menu?: MenuSource;
};

function CoverFan({ covers, fallback }: { covers: string[]; fallback: IconSvgElement }) {
  const shown = covers.slice(0, FAN.length);
  if (shown.length === 0) {
    return (
      <span className="grid h-full w-full place-items-center rounded-xl border border-separator bg-surface text-ink-1">
        <Icon icon={fallback} />
      </span>
    );
  }
  return (
    <span className="relative block h-full w-full overflow-hidden rounded-xl bg-wash">
      {shown.map((src, index) => (
        <img
          key={`${index}:${src}`}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full rounded-xl object-cover shadow-[var(--shadow-card)] ${FAN[index]}`}
        />
      ))}
    </span>
  );
}

export function CoverStack({ title, subtitle, covers, fallback, onOpen, onPlay, menu }: CoverStackProps) {
  return (
    <article
      className="group relative rounded-xl motion-safe:transition-colors [@media(hover:hover)]:hover:bg-wash"
      onContextMenu={menu ? (event) => openMenuAtPointer(event, menu) : undefined}
    >
      <button
        type="button"
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="block w-full rounded-xl p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="relative block isolate aspect-square">
          <CoverFan covers={covers} fallback={fallback} />
        </span>
        <span className="mt-3 block truncate text-[14px] font-semibold text-ink-1">{title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{subtitle}</span>
      </button>
      {(onPlay || menu) && (
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {onPlay && (
            <button
              type="button"
              aria-label={`Play ${title}`}
              onClick={onPlay}
              className="grid h-11 w-11 place-items-center rounded-full bg-primary text-on-primary shadow-[var(--shadow-card)] motion-safe:transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Icon icon={PlayIcon} />
            </button>
          )}
          {menu && <ActionMenu items={menu} label={`More options for ${title}`} triggerClass={COVER_MENU} />}
        </div>
      )}
    </article>
  );
}
