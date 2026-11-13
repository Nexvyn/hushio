import { useId, type MouseEvent, type ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { Switch } from "./Switch";

export type SettingRowProps = {
  icon: IconSvgElement;
  title: string;
  note?: string;
  value?: string;
  control?: ReactNode;
  toggle?: { checked: boolean; onChange: (checked: boolean) => void };
  disabled?: boolean;
  danger?: boolean;
  stacked?: boolean;
};

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
    <div className={`flex items-center gap-3 ${stacked ? "" : "shrink-0"}`}>
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
      className={`flex min-h-[52px] py-2 ${stacked ? "flex-col gap-2" : "items-center gap-4"} ${
        toggle && !disabled ? "cursor-pointer" : ""
      }`}
    >
      <div className={`min-w-0 ${stacked ? "" : "flex-1"}`}>
        <p
          id={titleId}
          className={`text-body font-medium ${danger ? "text-danger-text" : disabled ? "text-ink-2" : "text-ink-1"}`}
        >
          {title}
        </p>
        {note && <p className="mt-0.5 text-meta text-ink-2">{note}</p>}
      </div>
      {controls}
    </div>
  );
}
