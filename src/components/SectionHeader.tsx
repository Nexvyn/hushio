export type SectionHeaderProps = {
  title: string;
  id?: string;
  count?: number;
  action?: { label: string; onClick: () => void };
};

export function SectionHeader({ title, id, count, action }: SectionHeaderProps) {
  return (
    <div className="app-section-heading mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="flex min-w-0 items-baseline gap-2 text-section text-ink-1">
        <span className="truncate">{title}</span>
        {count !== undefined && <span className="text-body font-medium tabular-nums text-ink-2">{count}</span>}
      </h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="hit-area shrink-0 rounded-control text-meta font-medium text-ink-2 motion-safe:transition-opacity hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
