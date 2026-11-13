import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../../components/Icon";
import { SettingRow } from "../../components/SettingRow";
import type { SettingsGroup } from "./categories";

export function GroupView({ group }: { group: SettingsGroup }) {
  return (
    <section>
      {group.title && <h2 className="mb-1 text-meta font-medium text-ink-2">{group.title}</h2>}
      {group.note && <p className="mb-2 text-meta text-ink-2">{group.note}</p>}
      <div className="divide-y divide-separator">
        {group.rows.map((row) => (
          <SettingRow key={row.id} {...row} />
        ))}
        {group.body && <div className="py-3">{group.body}</div>}
      </div>
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
          <Icon icon={ArrowLeft01Icon} />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-section text-ink-1">{title}</h1>
        {note && <p className="mt-1 text-meta text-ink-2">{note}</p>}
      </div>
    </header>
  );
}
