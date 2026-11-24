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
    <div className="relative h-[132px] overflow-hidden rounded-[12px] bg-elevated">
      <motion.button
        type="button"
        onClick={() => {
          if (!hold.consumeHold()) navigate(item.target);
        }}
        {...hold.bind}
        whileTap={pressTap(reduced)}
        transition={phoneSmooth}
        className={`absolute inset-0 flex min-w-0 text-left ${focusRing}`}
      >
        <PhoneArt src={thumbArtwork(item.thumb, 132) || null} layoutId={`cover:${item.target.name}:${item.target.param}`} radius="rounded-none" className="block size-[132px] shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-4 pl-4 pr-16">
          <span className="truncate text-phone-utility text-ink-2">{item.label}</span>
          <span className="font-title line-clamp-2 text-phone-row-title text-ink-1">{item.title}</span>
          {item.subtitle && <span className="truncate text-phone-meta text-ink-2">{item.subtitle}</span>}
        </span>
      </motion.button>
      <motion.button
        type="button"
        aria-label={`Play ${item.title}`}
        onClick={() => void startPlaySource(item.source)}
        whileTap={pressTap(reduced)}
        transition={phoneSmooth}
        className={`absolute bottom-4 right-4 z-10 grid size-11 place-items-center rounded-full bg-primary text-on-primary ${focusRing}`}
      >
        <PhoneIcon icon={Play} size={24} />
      </motion.button>
    </div>
  );
}
