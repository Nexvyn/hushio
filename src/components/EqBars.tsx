const BAR_HEIGHTS = ["h-2", "h-3.5", "h-1.5"];

export function EqBars({ playing }: { playing: boolean }) {
  return (
    <span role="img" aria-label="Playing" className="inline-flex h-3.5 items-end gap-[2px]">
      {BAR_HEIGHTS.map((height, bar) => (
        <span
          key={bar}
          style={{ animationDelay: `calc(var(--dur-eq) * ${-bar * 0.35})` }}
          className={`w-[3px] rounded-[1px] bg-accent ${height} ${playing ? "bt-eq" : ""}`}
        />
      ))}
    </span>
  );
}
