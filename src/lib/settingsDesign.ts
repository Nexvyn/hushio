export const SETTINGS_TYPE = {
  heading: "text-[1.125rem] font-semibold leading-6 text-ink-1",
  body: "text-[0.9375rem] leading-5",
  note: "text-[0.8125rem] leading-[1.125rem] text-ink-2",
  value: "w-24 shrink-0 text-right text-[0.8125rem] leading-[1.125rem] tabular-nums text-ink-2",
  valueStacked: "min-w-[3.5rem] shrink-0 text-left text-[0.8125rem] leading-[1.125rem] tabular-nums text-ink-2",
  segment: "min-h-11 min-w-11 shrink-0 whitespace-nowrap px-3 text-[0.8125rem] font-medium",
} as const;

export const SETTINGS_SIZE = {
  tap: "min-h-11 min-w-11",
  control: "min-h-11",
  row: "min-h-14",
  slider: "w-40",
} as const;

export const SETTINGS_SPACE = {
  rows: "gap-2",
  groups: "space-y-8",
  heading: "mb-3",
  controls: "gap-3",
  row: "gap-4",
} as const;

export const SETTINGS_RADIUS = {
  control: "rounded-[12px]",
  segment: "rounded-[10px]",
} as const;
