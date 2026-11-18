export type Bar = { label: string; value: number; text: string };

type BarChartProps = {
  title: string;
  summary: string;
  bars: Bar[];
  ticks: { at: number; label: string }[];
  columns: number;
};

export function BarChart({ title, summary, bars, ticks, columns }: BarChartProps) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <figure className="m-0">
      <div role="img" aria-label={`${title}. ${summary}`} className="flex h-28 items-end gap-[3px]">
        {bars.map((bar) => (
          <span
            key={bar.label}
            aria-hidden="true"
            title={`${bar.label}: ${bar.text}`}
            className="block min-w-0 flex-1 rounded-[3px] bg-ink-1 motion-safe:transition-opacity"
            style={{
              height: bar.value > 0 ? `${Math.max(6, (bar.value / max) * 100)}%` : "4%",
              opacity: bar.value > 0 ? 0.85 : 0.14,
            }}
          />
        ))}
      </div>
      <div className="relative mt-2 h-4 text-caption tabular-nums text-ink-3" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick.label} className="absolute -translate-x-1/2" style={{ left: `${((tick.at + 0.5) / columns) * 100}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
      <ul className="sr-only">
        {bars.map((bar) => (
          <li key={bar.label}>
            {bar.label}: {bar.text}
          </li>
        ))}
      </ul>
    </figure>
  );
}
