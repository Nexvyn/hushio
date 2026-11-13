const BASE =
  "flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[12px] [corner-shape:squircle] px-4 text-[15px] font-semibold disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export const PHONE_PLAY = `${BASE} bg-[color:var(--hero-play-bg,rgb(var(--primary)))] text-[color:var(--hero-play-ink,rgb(var(--on-primary)))] hover:opacity-90`;

export const PHONE_SHUFFLE = `${BASE} bg-[color:var(--hero-shuffle-bg,rgb(var(--wash)))] text-[color:var(--hero-shuffle-ink,rgb(var(--ink-1)))] hover:bg-hover`;

export const PHONE_ICON =
  "grid size-12 shrink-0 place-items-center rounded-[12px] [corner-shape:squircle] text-[color:var(--hero-icon,rgb(var(--ink-1)))] hover:bg-wash active:opacity-60 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export const PHONE_HEADER_ICON =
  "grid size-11 shrink-0 place-items-center rounded-full text-[color:var(--hero-icon,rgb(var(--ink-1)))] hover:bg-wash active:opacity-60 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
