import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Heart } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import { ToggleIcon } from "./motion/ToggleIcon";
import { type LikeInput, useLibrary } from "../stores/library";
import { usePhone } from "../lib/usePhone";
import { likeJustAdded, type LikeSnapshot } from "../lib/likePop";
import { haptic } from "../lib/haptics";
import { fade } from "../lib/motion";

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

  const Glyph = phone ? PhoneIcon : Icon;
  const glyph = (
    <span className="relative grid place-items-center">
      <Glyph icon={Heart} fill="none" />
      <motion.span aria-hidden="true" className="absolute inset-0 grid place-items-center" initial={false} animate={{ opacity: liked ? 1 : 0 }} transition={fade}>
        <Glyph icon={Heart} fill="currentColor" />
      </motion.span>
    </span>
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
      className={`grid shrink-0 place-items-center rounded-full motion-safe:transition-[color,transform] motion-safe:duration-fade motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)] ${liked ? "text-ink-1" : "text-ink-2 hover:text-ink-1"} ${className}`}
    >
      <ToggleIcon kind="like" state={liked ? "on" : "off"}>
        {glyph}
      </ToggleIcon>
    </button>
  );
}
