import { useEffect, useRef } from "react";
import { Heart } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import { ToggleIcon } from "./motion/ToggleIcon";
import { type LikeInput, useLibrary } from "../stores/library";
import { usePhone } from "../lib/usePhone";
import { likeJustAdded, type LikeSnapshot } from "../lib/likePop";
import { haptic } from "../lib/haptics";

type LikeButtonProps = {
  track: LikeInput | null;
  className: string;
};

export function LikeButton({ track, className }: LikeButtonProps) {
  const phone = usePhone();
  const liked = useLibrary((state) => track !== null && state.liked.some((item) => item.id === track.id));
  const toggleLike = useLibrary((state) => state.toggleLike);
  const label = liked ? "Remove from Liked Songs" : "Add to Liked Songs";
  const trackId = track?.id ?? null;
  const seen = useRef<LikeSnapshot>({ id: trackId, liked });

  useEffect(() => {
    const before = seen.current;
    const after = { id: trackId, liked };
    seen.current = after;
    if (phone && likeJustAdded(before, after)) haptic("success");
    if (phone && before.id === after.id && before.liked && !after.liked) haptic("tick");
  }, [liked, trackId, phone]);

  const fill = liked ? "currentColor" : "none";
  const glyph = phone ? <PhoneIcon icon={Heart} fill={fill} /> : <Icon icon={Heart} fill={fill} />;

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
      className={`grid shrink-0 place-items-center rounded-full motion-safe:transition-[color,transform] motion-safe:active:scale-[0.94] ${phone ? "motion-safe:duration-fade" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)] ${liked ? "text-ink-1" : "text-ink-2 hover:text-ink-1"} ${className}`}
    >
      <ToggleIcon kind="like" state={liked ? "on" : "off"}>
        {glyph}
      </ToggleIcon>
    </button>
  );
}
