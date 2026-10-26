import { FavouriteIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { type LikeInput, useLibrary } from "../stores/library";

type LikeButtonProps = {
  track: LikeInput | null;
  className: string;
};

export function LikeButton({ track, className }: LikeButtonProps) {
  const liked = useLibrary((state) => track !== null && state.liked.some((item) => item.id === track.id));
  const toggleLike = useLibrary((state) => state.toggleLike);
  const label = liked ? "Remove from Liked Songs" : "Add to Liked Songs";

  return (
    <button
      type="button"
      aria-label="Like"
      aria-pressed={liked}
      title={label}
      disabled={track === null}
      onClick={() => {
        if (track) toggleLike(track);
      }}
      className={`grid shrink-0 place-items-center rounded-full motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)] ${liked ? "text-ink-1" : "text-ink-2 hover:text-ink-1"} ${className}`}
    >
      <Icon icon={FavouriteIcon} />
    </button>
  );
}
