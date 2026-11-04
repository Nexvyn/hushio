import { PlayIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base";

type PodcastCardProps = {
  title: string;
  subtitle: string;
  thumb: string | null;
  playable?: boolean;
  onActivate: () => void;
};

export function PodcastCard({ title, subtitle, thumb, playable = false, onActivate }: PodcastCardProps) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`group flex w-[184px] shrink-0 flex-col gap-2 rounded-[12px] p-2 text-left hover:bg-wash motion-safe:transition-colors motion-safe:active:scale-[0.98] ${focusRing}`}
    >
      <span className="relative block aspect-square w-full overflow-hidden rounded-[12px]">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="block h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 [[data-theme=dark]_&]:outline-white/10"
          />
        ) : (
          <span aria-hidden="true" className="block h-full w-full bg-wash" />
        )}
        {playable && (
          <span
            aria-hidden="true"
            className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary opacity-0 motion-safe:transition-opacity [@media(hover:hover)]:group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <Icon icon={PlayIcon} />
          </span>
        )}
      </span>
      <span className="block min-w-0 px-0.5">
        <span className="line-clamp-2 block text-[15px] font-semibold leading-snug text-ink-1">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-2">{subtitle}</span>
      </span>
    </button>
  );
}
