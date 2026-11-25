import { isValidElement, useId, type MouseEvent, type ReactNode } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { SETTINGS_SIZE, SETTINGS_SPACE, SETTINGS_TYPE } from "../lib/settingsDesign";
import { usePhone } from "../lib/usePhone";
import { Slider } from "./Slider";
import { Switch } from "./Switch";

export type SettingRowProps = {
  icon: PhosphorIcon;
  title: string;
  note?: string;
  searchTerms?: string[];
  value?: string;
  control?: ReactNode;
  toggle?: { checked: boolean; onChange: (checked: boolean) => void };
  disabled?: boolean;
  danger?: boolean;
  stacked?: boolean;
};

function isSlider(control: ReactNode): boolean {
  return isValidElement(control) && control.type === Slider;
}

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
  const phone = usePhone();
  const column = stacked || (phone && isSlider(control));
  const tone = danger ? "text-danger-text" : disabled ? "text-ink-3" : "text-ink-1";

  const controls = (
    <div
      className={`flex items-center ${SETTINGS_SPACE.controls} ${
        column
          ? "w-full [&_[role=radiogroup]]:max-w-full [&_[role=radiogroup]]:flex-wrap [&_input[type=range]]:w-auto [&_input[type=range]]:flex-1"
          : "shrink-0"
      }`}
    >
      {value && <span className={SETTINGS_TYPE.value}>{value}</span>}
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
      className={`flex ${SETTINGS_SIZE.row} py-2 ${
        column ? `flex-col items-stretch ${SETTINGS_SPACE.rows}` : `items-center ${SETTINGS_SPACE.row}`
      } ${toggle && !disabled ? "cursor-pointer" : ""}`}
    >
      <div className={`min-w-0 ${column ? "" : "flex-1"}`}>
        <p id={titleId} className={`${SETTINGS_TYPE.body} ${tone}`}>
          {title}
        </p>
        {note && <p className={`mt-0.5 ${SETTINGS_TYPE.note}`}>{note}</p>}
      </div>
      {controls}
    </div>
  );
}
