import { useId, type MouseEvent, type ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "./Icon";
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
};

export function SettingRow({
  icon,
  title,
  note,
  value,
  control,
  toggle,
  disabled = false,
  danger = false,
}: SettingRowProps) {
  const titleId = useId();

  function onRowClick(event: MouseEvent<HTMLDivElement>) {
    if (!toggle || disabled) return;
    if (event.target instanceof Element && event.target.closest('[role="switch"]')) return;
    toggle.onChange(!toggle.checked);
  }

  return (
    <div
      onClick={onRowClick}
      className={`flex items-center gap-4 px-4 py-3 ${toggle && !disabled ? "cursor-pointer" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-wash ${
          danger ? "text-danger-text" : "text-ink-2"
        }`}
      >
        <Icon icon={icon} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          className={`text-[13.5px] font-medium ${
            danger ? "text-danger-text" : disabled ? "text-ink-2" : "text-ink-1"
          }`}
        >
          {title}
        </p>
        {note && <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{note}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {value && <span className="text-[12.5px] tabular-nums text-ink-2">{value}</span>}
        {toggle ? (
          <Switch
            checked={toggle.checked}
            disabled={disabled}
            aria-labelledby={titleId}
            onCheckedChange={toggle.onChange}
          />
        ) : (
          control
        )}
      </div>
    </div>
  );
}
