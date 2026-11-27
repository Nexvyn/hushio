import { type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { CaretLeft, MusicNote, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { useCoverFill } from "./useCoverFill";
import { useImageReveal } from "../useImageReveal";
import { DURATION_MS, EASE_OUT, MS_FADE, MS_IMAGE, fade, phoneTween, reducedMotion } from "../../lib/motion";

export type PhoneHeaderProps = {
  title: string;
  meta?: ReactNode;
  artwork?: string | null;
  icon?: PhosphorIcon;
  actions?: ReactNode;
  titleId?: string;
  titleTooltip?: string;
  onBack?: () => void;
  backLabel?: string;
  description?: string;
  onEdit?: () => void;
  sharedArtworkId?: string;
};

const BACK =
  "grid size-11 shrink-0 place-items-center rounded-full text-[color:var(--hero-icon,rgb(var(--ink-1)))] motion-safe:transition-[color,background-color,transform,opacity] motion-safe:duration-press motion-safe:active:scale-[0.97] hover:bg-wash active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function PhoneBackRow({ onBack, label = "Back" }: { onBack: () => void; label?: string }) {
  return (
    <div className="relative z-10 flex h-11 w-full items-center justify-start -mb-7">
      <button type="button" aria-label={label} onClick={onBack} className={`-ml-3 ${BACK}`}>
        <PhoneIcon icon={CaretLeft} />
      </button>
    </div>
  );
}

export function PhoneHeader({
  title,
  meta,
  artwork,
  icon,
  actions,
  titleId,
  titleTooltip,
  onBack,
  backLabel = "Back",
  description,
  onEdit,
  sharedArtworkId,
}: PhoneHeaderProps) {
  const fill = useCoverFill(artwork ?? "");
  const art = useImageReveal(artwork);

  if (artwork === undefined) {
    return (
      <header className="mb-3 mt-2 flex min-h-11 min-w-0 items-center gap-2">
        {onBack && (
          <button type="button" aria-label={backLabel} onClick={onBack} className={`-ml-3 ${BACK}`}>
            <PhoneIcon icon={CaretLeft} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1
            id={titleId}
            title={titleTooltip}
            className="break-words font-title text-phone-page-title text-ink-1"
          >
            {title}
          </h1>
          {meta && <div className="mt-0.5 text-phone-meta tabular-nums text-ink-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
    );
  }

  const tone = "text-ink-1";
  const dim = "text-ink-2";
  const topGap = onBack ? "" : "mt-2 ";
  const morph = Boolean(sharedArtworkId) && !reducedMotion();

  return (
    <header
      style={{
        "--hero-icon": "rgb(var(--ink-1))",
        "--hero-play-bg": "rgb(var(--ink-1))",
        "--hero-play-ink": "rgb(var(--base))",
        "--hero-shuffle-bg": "rgb(var(--ink-1) / 0.08)",
        "--hero-shuffle-ink": "rgb(var(--ink-1))",
      } as CSSProperties}
      className="relative -mx-4 mb-4 flex min-w-0 flex-col items-center rounded-b-[24px] px-4 pb-5 text-center"
    >
      {fill && <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-b-[24px]" style={{ backgroundColor: fill }} initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={reducedMotion() ? fade : phoneTween(MS_IMAGE)} />}
      {onBack && <PhoneBackRow onBack={onBack} label={backLabel} />}
      {artwork && onEdit ? (
        <button type="button" aria-label="Edit details" onClick={onEdit} className={`${topGap}size-52 shrink-0 rounded-[12px] [corner-shape:squircle]`}>
        <motion.img layoutId={reducedMotion() ? undefined : sharedArtworkId} transition={reducedMotion() ? { duration: MS_FADE / 1000, ease: EASE_OUT } : { layout: phoneTween(DURATION_MS.roll), opacity: phoneTween(MS_IMAGE) }} loading="lazy" decoding="async" src={artwork} alt="" onLoad={art.onLoad} initial={false} animate={{ opacity: art.shown ? 1 : 0 }} className="size-full rounded-[12px] [corner-shape:squircle] object-cover" />
        </button>
      ) : artwork ? (
        <motion.img layoutId={reducedMotion() ? undefined : sharedArtworkId} transition={reducedMotion() ? { duration: MS_FADE / 1000, ease: EASE_OUT } : { layout: phoneTween(DURATION_MS.roll), opacity: phoneTween(MS_IMAGE) }} loading="lazy" decoding="async" src={artwork} alt="" onLoad={art.onLoad} initial={false} animate={{ opacity: art.shown ? 1 : 0 }} className={`${topGap}size-52 shrink-0 rounded-[12px] [corner-shape:squircle] object-cover`} />
      ) : (
        <span
          aria-hidden="true"
          data-testid="page-tile"
          className={`${topGap}grid size-[120px] shrink-0 place-items-center rounded-[12px] [corner-shape:squircle] bg-wash text-ink-2`}
        >
          <PhoneIcon icon={icon ?? MusicNote} />
        </span>
      )}
      <motion.div
        initial={morph ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: MS_FADE / 1000, ease: EASE_OUT, delay: morph ? DURATION_MS.roll / 1000 : 0 }}
        className="flex w-full min-w-0 flex-col items-center"
      >
        <h1
          id={titleId}
          title={titleTooltip}
          className={`mt-4 line-clamp-2 max-w-full break-words font-title text-phone-page-title ${tone}`}
        >
          {onEdit ? (
            <button type="button" onClick={onEdit} className="max-w-full text-center">
              {title}
            </button>
          ) : (
            title
          )}
        </h1>
        {description && <p className={`mt-1.5 line-clamp-3 max-w-full break-words text-phone-meta ${dim}`}>{description}</p>}
        {meta && <div className={`mt-1 text-phone-meta tabular-nums ${dim}`}>{meta}</div>}
      </motion.div>
      {actions && <div className="mt-5 flex w-full min-w-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
