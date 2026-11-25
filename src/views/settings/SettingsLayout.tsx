import { CaretLeft } from "@phosphor-icons/react";
import { Icon } from "../../components/Icon";
import { SettingRow } from "../../components/SettingRow";
import { PhoneHeader } from "../../components/phone/PhoneHeader";
import { SETTINGS_SPACE, SETTINGS_TYPE } from "../../lib/settingsDesign";
import { usePhone } from "../../lib/usePhone";
import type { SettingsGroup } from "./categories";

export function GroupView({ group }: { group: SettingsGroup }) {
  if (group.plain) {
    return <section>{group.body}</section>;
  }
  return (
    <section>
      {group.title && <h2 className={`${SETTINGS_SPACE.heading} ${SETTINGS_TYPE.heading}`}>{group.title}</h2>}
      {group.note && <p className={`${SETTINGS_SPACE.heading} ${SETTINGS_TYPE.note}`}>{group.note}</p>}
      {group.rows.length > 0 ? (
        <>
          <div className={`flex flex-col ${SETTINGS_SPACE.rows}`}>
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
  const phone = usePhone();
  if (phone) {
    return (
      <>
        <PhoneHeader title={title} onBack={onBack} backLabel={backLabel} />
        {note && <p className={`mb-4 ${SETTINGS_TYPE.note}`}>{note}</p>}
      </>
    );
  }
  return (
    <header className="mb-4 flex items-start gap-2">
      {onBack && (
        <button
          type="button"
          aria-label={backLabel}
          onClick={onBack}
          className={`hit-area -ml-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] [corner-shape:squircle] text-ink-1 motion-safe:transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
        >
          <Icon icon={CaretLeft} />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-section text-ink-1">{title}</h1>
        {note && <p className={`mt-1 ${SETTINGS_TYPE.note}`}>{note}</p>}
      </div>
    </header>
  );
}
