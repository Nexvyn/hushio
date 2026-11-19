import { useId, type MouseEvent, type ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Switch } from "./Switch";

export type SettingRowProps = {
  icon: PhosphorIcon;
  title: string;
  note?: string;
  value?: string;
  control?: ReactNode;
  toggle?: { checked: boolean; onChange: (checked: boolean) => void };
  disabled?: boolean;
  danger?: boolean;
  stacked?: boolean;
};

export const CONTROL_CLASSES =
  "[&_.app-control]:h-9 [&_.app-control]:min-h-9 [&_.app-control]:rounded-[8px] [&_.app-control]:px-4 [&_.app-control:not(.bg-accent)]:bg-transparent [&_.app-control:not(.bg-accent)]:border [&_.app-control:not(.bg-accent)]:border-separator [&_.app-control:not(.bg-accent):hover]:bg-hover [&_[role=radiogroup]]:bg-transparent [&_[role=radiogroup]]:gap-1 [&_[role=radiogroup]]:p-0 [&_[role=radio]]:h-8 [&_[role=radio]]:rounded-[8px] [&_[role=radio][aria-checked=true]]:bg-ink-1 [&_[role=radio][aria-checked=true]]:text-[rgb(var(--base))] [&_[role=radio][aria-checked=false]:hover]:bg-hover";

export function SettingRow({
  title,
  note,
  value,
  control,
  toggle,
  disabled = false,
  danger = false,
  stacked = false,
}: SettingRowProps) {
  const titleId = useId();
  const controls = (
    <div className={`flex items-center gap-3 ${stacked ? "" : "shrink-0"} ${CONTROL_CLASSES}`}>
      {value && <span className="text-meta tabular-nums text-ink-2">{value}</span>}
      {toggle ? (
        <Switch checked={toggle.checked} disabled={disabled} aria-labelledby={titleId} onCheckedChange={toggle.onChange} />
      ) : (
        control
      )}
    </div>
  );

  function onRowClick(event: MouseEvent<HTMLDivElement>) {
    if (!toggle || disabled) return;
    if (event.target instanceof Element && event.target.closest('[role="switch"]')) return;
    toggle.onChange(!toggle.checked);
  }

  return (
    <div
      onClick={onRowClick}
      className={`flex min-h-[56px] py-2 ${stacked ? "flex-col gap-2" : "items-center gap-4"} ${
        toggle && !disabled ? "cursor-pointer" : ""
      }`}
    >
      <div className={`min-w-0 ${stacked ? "" : "flex-1"}`}>
        <p
          id={titleId}
          className={`text-body ${danger ? "text-danger-text" : disabled ? "text-ink-2" : "text-ink-1"}`}
        >
          {title}
        </p>
        {note && <p className="mt-0.5 text-meta text-ink-2">{note}</p>}
      </div>
      {controls}
    </div>
  );
}
