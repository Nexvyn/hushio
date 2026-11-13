import { forwardRef, useState } from "react";
import { getMoodCovers } from "../lib/explore";
import { useCovers } from "../lib/exploreCovers";
import { MOOD_BROWSE_ID, type MoodEntry } from "../lib/moods";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

export type TileVariant = "mood" | "genre";

const TILE_BASE =
  "group relative isolate block w-full overflow-hidden rounded-[12px] bg-wash text-left motion-safe:transition-transform motion-safe:duration-quick motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

const VARIANT_CLASS: Record<TileVariant, { size: string; label: string }> = {
  mood: { size: "aspect-[16/10]", label: "px-3 pb-3 pt-8 text-[16px] font-semibold leading-tight" },
  genre: { size: "aspect-square", label: "px-2.5 pb-2.5 pt-6 text-[14px] font-semibold leading-tight" },
};

export type ArtTileProps = {
  label: string;
  src: string | null;
  variant: TileVariant;
  onClick: () => void;
  onBroken?: () => void;
};

export const ArtTile = forwardRef<HTMLButtonElement, ArtTileProps>(function ArtTile(
  { label, src, variant, onClick, onBroken },
  ref,
) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const art = src && src !== brokenSrc ? src : null;
  const { size, label: labelClass } = VARIANT_CLASS[variant];

  return (
    <button ref={ref} type="button" onClick={onClick} className={`${TILE_BASE} ${size}`}>
      {art && (
        <img
          src={art}
          alt=""
          onError={() => {
            setBrokenSrc(art);
            onBroken?.();
          }}
          className="absolute inset-0 h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-quick motion-safe:group-hover:scale-[1.02]"
        />
      )}
      {art && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(to_top,rgb(0_0_0/0.72),transparent)]"
        />
      )}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[12px] outline outline-1 -outline-offset-1 outline-ink-1/[0.08]" />
      <span className={`absolute inset-x-0 bottom-0 min-w-0 truncate ${labelClass} ${art ? "text-on-scrim [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]" : "text-ink-1"}`}>
        {label}
      </span>
    </button>
  );
});

type MoodCardProps = { mood: MoodEntry; variant?: TileVariant };

export function MoodCard({ mood, variant = "mood" }: MoodCardProps) {
  const navigate = useNavigation((state) => state.navigate);
  const setSearchQuery = useUI((state) => state.setSearchQuery);
  const key = mood.params ? `mood:${MOOD_BROWSE_ID}|${mood.params}` : null;
  const { ref, covers, markBroken } = useCovers<HTMLButtonElement>(mood.browseId ? key : null, () =>
    getMoodCovers(mood.browseId, mood.params),
  );

  const open = () => {
    if (mood.params) {
      navigate({ name: "mood", param: mood.params });
      return;
    }
    setSearchQuery(mood.title);
    navigate({ name: "search" });
  };

  return (
    <ArtTile ref={ref} label={mood.title} src={covers?.[0] ?? null} variant={variant} onClick={open} onBroken={markBroken} />
  );
}
