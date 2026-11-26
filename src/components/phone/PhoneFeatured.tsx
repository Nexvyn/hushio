import { Play } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { focusRing } from "../HomeShelves";
import { thumbArtwork } from "../../lib/artwork";
import type { PlaySource } from "../../lib/playQueue";
import { startPlaySource } from "../../lib/playSource";
import { phoneSmooth, pressTap, reducedMotion } from "../../lib/motion";
import { useNavigation } from "../../stores/navigation";
import type { MenuSource } from "../ContextMenu";
import { PhoneArt } from "./PhoneArt";
import { PhoneIcon } from "./PhoneIcon";
import { menuAt, useCardLongPress } from "./useCardLongPress";

export type FeaturedItem = {
  label: string;
  title: string;
  subtitle?: string;
  thumb: string | null;
  source: PlaySource;
  target: { name: "album" | "ytplaylist"; param: string };
};

export function PhoneFeatured({ item, menu }: { item: FeaturedItem; menu?: MenuSource }) {
  const navigate = useNavigation((state) => state.navigate);
  const reduced = reducedMotion();
  const hold = useCardLongPress(menuAt(menu));

  return (
    <div className="flex items-center gap-4">
      <motion.button
        type="button"
        onClick={() => {
          if (!hold.consumeHold()) navigate(item.target);
        }}
        {...hold.bind}
        whileTap={pressTap(reduced)}
        transition={phoneSmooth}
        className={`flex min-w-0 flex-1 items-center gap-4 rounded-[12px] text-left ${focusRing}`}
      >
        <PhoneArt src={thumbArtwork(item.thumb, 112) || null} layoutId={`cover:${item.target.name}:${item.target.param}`} className="block size-[112px] shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-title text-phone-row-title font-semibold leading-5 text-ink-1">{item.title}</span>
          {item.subtitle && <span className="truncate text-meta text-ink-2">{item.subtitle}</span>}
        </span>
      </motion.button>
      <motion.button
        type="button"
        aria-label={`Play ${item.title}`}
        onClick={() => void startPlaySource(item.source)}
        whileTap={pressTap(reduced)}
        transition={phoneSmooth}
        className={`hit-area grid size-11 shrink-0 place-items-center rounded-full border border-ink-2 text-ink-1 ${focusRing}`}
      >
        <PhoneIcon icon={Play} size={24} />
      </motion.button>
    </div>
  );
}
