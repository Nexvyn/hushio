import { PlayIcon } from "@hugeicons/core-free-icons";
import { AmbientBackdrop, paletteCoverFor } from "../AmbientBackdrop";
import { focusRing } from "../HomeShelves";
import { thumbArtwork } from "../../lib/artwork";
import { AMBIENT_FALLBACK, useArtworkPalette } from "../../lib/artworkPalette";
import type { PlaySource } from "../../lib/playQueue";
import { startPlaySource } from "../../lib/playSource";
import { OnArtContext } from "../../lib/onArt";
import { useNavigation } from "../../stores/navigation";
import { PhoneArt } from "./PhoneArt";
import { PhoneIcon } from "./PhoneIcon";

export type FeaturedItem = {
  label: string;
  title: string;
  subtitle?: string;
  thumb: string | null;
  source: PlaySource;
  target: { name: "album" | "ytplaylist"; param: string };
};

export function PhoneFeatured({ item }: { item: FeaturedItem }) {
  const navigate = useNavigation((state) => state.navigate);
  const paletteSrc = paletteCoverFor({ thumb: item.thumb });
  const palette = useArtworkPalette(paletteSrc);
  const onArt = paletteSrc !== "" && palette !== AMBIENT_FALLBACK;
  const quietTone = onArt ? "text-art/[0.72]" : "text-ink-2";
  const titleTone = onArt ? "text-art" : "text-ink-1";

  return (
    <div
      className={`relative h-[132px] overflow-hidden rounded-[12px] motion-safe:transition-transform motion-safe:ease-out active:scale-[0.97] ${onArt ? "" : "bg-elevated"}`}
    >
      {onArt && <AmbientBackdrop primary={palette.primary} src={paletteSrc} className="absolute inset-0" />}
      <OnArtContext.Provider value={onArt}>
        <button
          type="button"
          onClick={() => navigate(item.target)}
          className={`absolute inset-0 flex min-w-0 text-left ${focusRing}`}
        >
          <PhoneArt src={thumbArtwork(item.thumb, 132) || null} radius="rounded-none" className="block size-[132px] shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-4 pl-4 pr-16">
            <span className={`truncate text-[12px] leading-4 font-semibold ${quietTone}`}>{item.label}</span>
            <span className={`font-title line-clamp-2 text-[20px] leading-6 font-bold ${titleTone}`}>{item.title}</span>
            {item.subtitle && <span className={`truncate text-[13px] leading-[17px] ${quietTone}`}>{item.subtitle}</span>}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Play ${item.title}`}
          onClick={() => void startPlaySource(item.source)}
          className={`absolute bottom-4 right-4 z-10 grid size-11 place-items-center rounded-full motion-safe:transition-transform active:scale-95 ${onArt ? "bg-art text-base" : "bg-primary text-on-primary"} ${focusRing}`}
        >
          <PhoneIcon icon={PlayIcon} size={24} />
        </button>
      </OnArtContext.Provider>
    </div>
  );
}
