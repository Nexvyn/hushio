import { isValidElement, useId, type MouseEvent, type ReactNode } from "react";
import { CaretLeft } from "@phosphor-icons/react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { CONTROL_CLASSES, SettingRow, type SettingRowProps } from "../../components/SettingRow";
import { Switch } from "../../components/Switch";
import type { SettingsGroup } from "./categories";

function isShortButton(control: ReactNode): boolean {
  return isValidElement(control) && control.type === Button;
}

function PhoneSettingRow({ title, note, value, control, toggle, disabled = false, danger = false, stacked = false }: SettingRowProps) {
  const titleId = useId();
  const wide = stacked || (!toggle && control !== undefined && !isShortButton(control));
  const controls = (
    <div
      className={
        wide
          ? `flex w-full items-center gap-3 [&_[role=radiogroup]]:w-full [&_[role=radio]]:flex-1 [&_[role=radio]]:min-w-0 [&_[role=radio]]:truncate [&_[role=radio]]:px-1 [&_input[type=range]]:w-auto [&_input[type=range]]:flex-1 ${CONTROL_CLASSES}`
          : `flex h-[22px] shrink-0 items-center gap-3 ${CONTROL_CLASSES}`
      }
    >
      {value && <span className="text-meta tabular-nums text-ink-2">{value}</span>}
      {toggle ? (
        <Switch
          checked={toggle.checked}
          disabled={disabled}
          aria-labelledby={titleId}
          className={toggle.checked ? "!bg-accent" : undefined}
          onCheckedChange={toggle.onChange}
        />
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
      className={`flex min-h-[52px] py-2.5 ${wide ? "flex-col gap-2" : "items-center gap-4"} ${
        toggle && !disabled ? "cursor-pointer" : ""
      }`}
    >
      <div className={`min-w-0 ${wide ? "" : "flex-1"}`}>
        <p
          id={titleId}
          className={`text-body leading-[22px] ${danger ? "text-danger-text" : disabled ? "text-ink-2" : "text-ink-1"}`}
        >
          {title}
        </p>
        {note && <p className="mt-0.5 text-meta leading-[18px] text-ink-2">{note}</p>}
      </div>
      {controls}
    </div>
  );
}

const PHONE_BOX = "divide-y divide-separator rounded-[12px] [corner-shape:squircle] bg-elevated px-4";

export function GroupView({ group, phone = false }: { group: SettingsGroup; phone?: boolean }) {
  if (group.plain) {
    return <section className={phone ? "mt-6 first:mt-0" : undefined}>{group.body}</section>;
  }
  if (phone) {
    return (
      <section className="mt-6 first:mt-0">
        {group.title && <h2 className="mb-2 text-meta font-semibold leading-[18px] text-ink-2">{group.title}</h2>}
        {group.note && <p className="mb-2 text-meta leading-[18px] text-ink-2">{group.note}</p>}
        <div className={PHONE_BOX}>
          {group.rows.map((row) => (
            <PhoneSettingRow key={row.id} {...row} />
          ))}
          {group.body && <div className="py-3">{group.body}</div>}
        </div>
      </section>
    );
  }
  return (
    <section>
      {group.title && <h2 className="mb-2 text-meta font-semibold text-ink-2">{group.title}</h2>}
      {group.note && <p className="mb-2 text-meta text-ink-2">{group.note}</p>}
      {group.rows.length > 0 ? (
        <>
          <div className="flex flex-col gap-4">
            {group.rows.map((row) => (
              <SettingRow key={row.id} {...row} />
            ))}
          </div>
          {group.body && <div className="mt-4">{group.body}</div>}
        </>
      ) : (
        group.body
      )}
    </section>
  );
}

type PageHeaderProps = {
  title: string;
  note?: string;
  onBack?: () => void;
  backLabel?: string;
};

export function PageHeader({ title, note, onBack, backLabel = "Back to settings" }: PageHeaderProps) {
  return (
    <header className="mb-4 flex items-start gap-2">
      {onBack && (
        <button
          type="button"
          aria-label={backLabel}
          onClick={onBack}
          className="hit-area -ml-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] [corner-shape:squircle] text-ink-1 motion-safe:transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Icon icon={CaretLeft} />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-section text-ink-1">{title}</h1>
        {note && <p className="mt-1 text-meta text-ink-2">{note}</p>}
      </div>
    </header>
  );
}
