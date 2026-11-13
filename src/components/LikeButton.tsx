import { useEffect, useRef } from "react";
import { useAnimate } from "motion/react";
import { FavouriteIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { type LikeInput, useLibrary } from "../stores/library";
import { usePhone } from "../lib/usePhone";
import { phoneBouncy, reducedMotion } from "../lib/motion";
import { likeJustAdded, type LikeSnapshot } from "../lib/likePop";
import { haptic } from "../lib/haptics";

type LikeButtonProps = {
  track: LikeInput | null;
  className: string;
};

export function LikeButton({ track, className }: LikeButtonProps) {
  const phone = usePhone();
  const reduced = reducedMotion();
  const liked = useLibrary((state) => track !== null && state.liked.some((item) => item.id === track.id));
  const toggleLike = useLibrary((state) => state.toggleLike);
  const label = liked ? "Remove from Liked Songs" : "Add to Liked Songs";
  const trackId = track?.id ?? null;
  const [scope, animateScope] = useAnimate<HTMLSpanElement>();
  const seen = useRef<LikeSnapshot>({ id: trackId, liked });

  useEffect(() => {
    const before = seen.current;
    const after = { id: trackId, liked };
    seen.current = after;
    if (phone && likeJustAdded(before, after)) haptic("success");
    if (phone && before.id === after.id && before.liked && !after.liked) haptic("tick");
    if (phone && !reduced && scope.current && likeJustAdded(before, after)) {
      void animateScope(scope.current, { scale: [1, 1.25, 1] }, phoneBouncy);
    }
  }, [liked, trackId, phone, reduced, animateScope, scope]);

  const icon = phone ? (
    <span ref={scope} className="grid place-items-center">
      <Icon icon={FavouriteIcon} />
    </span>
  ) : (
    <Icon icon={FavouriteIcon} />
  );

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
      className={`grid shrink-0 place-items-center rounded-full motion-safe:transition-colors ${phone ? "motion-safe:duration-fade" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)] ${liked ? "text-ink-1" : "text-ink-2 hover:text-ink-1"} ${className}`}
    >
      {icon}
    </button>
  );
}
