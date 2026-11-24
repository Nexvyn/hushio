import { Play, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { ActionMenu } from "./ActionMenu";
import { type MenuSource, openMenuAtPointer } from "./ContextMenu";
import { Icon } from "./Icon";
const COVER_MENU =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface/90 text-ink-1 shadow-[var(--shadow-chip)] motion-safe:transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

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
  fallback: PhosphorIcon;
  onOpen: () => void;
  onPlay?: () => void;
  menu?: MenuSource;
};

function CoverFan({ covers, fallback }: { covers: string[]; fallback: PhosphorIcon }) {
  const shown = covers.slice(0, FAN.length);
  if (shown.length === 0) {
    return (
      <span className="grid h-full w-full place-items-center rounded-art bg-wash text-ink-1">
        <Icon icon={fallback} />
      </span>
    );
  }
  return (
    <span className="relative block h-full w-full overflow-hidden rounded-art bg-wash">
      {shown.map((src, index) => (
        <img loading="lazy" decoding="async"
          key={`${index}:${src}`}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full rounded-art object-cover shadow-[var(--shadow-card)] ${FAN[index]}`}
        />
      ))}
    </span>
  );
}

export function CoverStack({ title, subtitle, covers, fallback, onOpen, onPlay, menu }: CoverStackProps) {
  return (
    <article
      className="group relative min-w-0"
      onContextMenu={menu ? (event) => openMenuAtPointer(event, menu) : undefined}
    >
      <button
        type="button"
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="block w-full rounded-art text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="relative block isolate aspect-square">
          <CoverFan covers={covers} fallback={fallback} />
        </span>
        <span className="mt-2 block truncate text-body font-semibold text-ink-1">{title}</span>
        <span className="block truncate text-meta text-ink-2">{subtitle}</span>
      </button>
      {(onPlay || menu) && (
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {onPlay && (
            <button
              type="button"
              aria-label={`Play ${title}`}
              onClick={onPlay}
              className="grid h-11 w-11 place-items-center rounded-full bg-panel text-ink-1 shadow-float motion-safe:transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Icon icon={Play} />
            </button>
          )}
          {menu && <ActionMenu items={menu} label={`More options for ${title}`} triggerClass={COVER_MENU} />}
        </div>
      )}
    </article>
  );
}
