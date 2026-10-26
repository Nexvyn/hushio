export function EqBars({ playing }: { playing: boolean }) {
  return (
    <span role="img" aria-label="Playing" className="inline-flex h-3.5 items-end gap-[2px]">
      {["h-2", "h-3.5", "h-1.5"].map((height, bar) => (
        <span
          key={bar}
          style={{ animationDelay: `${bar * 150}ms` }}
          className={`w-[3px] rounded-[1px] bg-accent ${height} ${playing ? "motion-safe:animate-pulse" : ""}`}
        />
      ))}
    </span>
  );
}
