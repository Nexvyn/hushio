import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { ArrowLeft01Icon, MusicNote01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../Icon";
import { PhoneIcon } from "./PhoneIcon";
import { useCoverFill } from "./useCoverFill";
import { INSET_TOP } from "../../lib/phoneNav";

export type PhoneHeaderProps = {
  title: string;
  meta?: ReactNode;
  artwork?: string | null;
  icon?: IconSvgElement;
  actions?: ReactNode;
  titleId?: string;
  titleTooltip?: string;
  onBack?: () => void;
  backLabel?: string;
};

const BACK =
  "grid size-11 shrink-0 place-items-center rounded-full text-[color:var(--hero-icon,rgb(var(--ink-1)))] motion-safe:transition-colors hover:bg-wash active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function bandStyle(fill: string): CSSProperties {
  return {
    backgroundColor: fill,
    marginTop: `calc(-1 * (${INSET_TOP} + 12px))`,
    paddingTop: `calc(${INSET_TOP} + 12px)`,
    "--hero-icon": "rgb(var(--on-art))",
    "--hero-play-bg": "rgb(var(--on-art))",
    "--hero-play-ink": fill,
    "--hero-shuffle-bg": "rgb(var(--on-art) / 0.16)",
    "--hero-shuffle-ink": "rgb(var(--on-art))",
  } as CSSProperties;
}

function useStatusBand(ref: RefObject<HTMLElement | null>, fill: string | null) {
  useEffect(() => {
    if (fill === null) return;
    const root = document.documentElement;
    const scroller = document.getElementById("view-scroll");
    const sync = () => {
      const band = ref.current;
      const strip = document.querySelector<HTMLElement>("[data-status-strip]");
      if (!band || !strip) return;
      if (band.getBoundingClientRect().bottom > strip.getBoundingClientRect().bottom) {
        root.style.setProperty("--phone-status-bg", fill);
      } else {
        root.style.removeProperty("--phone-status-bg");
      }
    };
    sync();
    scroller?.addEventListener("scroll", sync, { passive: true });
    return () => {
      scroller?.removeEventListener("scroll", sync);
      root.style.removeProperty("--phone-status-bg");
    };
  }, [fill, ref]);
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
}: PhoneHeaderProps) {
  const ref = useRef<HTMLElement>(null);
  const fill = useCoverFill(artwork ?? "");
  useStatusBand(ref, fill);

  if (artwork === undefined) {
    return (
      <header className="mb-3 mt-2 flex min-w-0 items-center gap-2">
        {onBack && (
          <button type="button" aria-label={backLabel} onClick={onBack} className={`-ml-3 ${BACK}`}>
            <PhoneIcon icon={ArrowLeft01Icon} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1
            id={titleId}
            title={titleTooltip}
            className="break-words font-title text-[30px] font-bold leading-9 tracking-[-0.02em] text-ink-1"
          >
            {title}
          </h1>
          {meta && <div className="mt-0.5 text-[13.5px] leading-[18px] tabular-nums text-ink-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
    );
  }

  const tone = fill ? "text-art" : "text-ink-1";
  const dim = fill ? "text-art/[0.72]" : "text-ink-2";
  const topGap = onBack || fill ? "" : "mt-2 ";

  return (
    <header
      ref={ref}
      style={fill ? bandStyle(fill) : undefined}
      className={`flex min-w-0 flex-col items-center text-center ${fill ? "relative -mx-4 mb-4 rounded-b-[24px] px-4 pb-5" : ""}`}
    >
      {onBack && (
        <div className="relative z-10 flex h-11 w-full items-center justify-start -mb-7">
          <button type="button" aria-label={backLabel} onClick={onBack} className={`-ml-3 ${BACK}`}>
            <PhoneIcon icon={ArrowLeft01Icon} />
          </button>
        </div>
      )}
      {artwork ? (
        <img src={artwork} alt="" className={`${topGap}size-52 shrink-0 rounded-[12px] [corner-shape:squircle] object-cover`} />
      ) : (
        <span
          aria-hidden="true"
          data-testid="page-tile"
          className={`${topGap}grid size-30 shrink-0 place-items-center rounded-[12px] [corner-shape:squircle] bg-wash text-ink-2`}
        >
          <Icon icon={icon ?? MusicNote01Icon} />
        </span>
      )}
      <h1
        id={titleId}
        title={titleTooltip}
        className={`mt-4 line-clamp-2 max-w-full break-words font-title text-[22px] font-bold leading-7 tracking-[-0.02em] ${tone}`}
      >
        {title}
      </h1>
      {meta && <div className={`mt-1 text-[13.5px] leading-[18px] tabular-nums ${dim}`}>{meta}</div>}
      {actions && <div className="mt-5 flex w-full min-w-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
