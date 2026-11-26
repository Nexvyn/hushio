import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { fmtTime } from "../lib/format";

export function PlaybackTimeline({ position, duration, onSeek, onArt = false, trackId }: { position: number; duration: number; onSeek: (seconds: number) => void; onArt?: boolean; trackId?: string }) {
  const [scrub, setScrub] = useState<number | null>(null);
  const interaction = useRef<"pointer" | "keyboard" | null>(null);
  const max = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const value = Math.min(max, Math.max(0, scrub ?? (Number.isFinite(position) ? position : 0)));
  useEffect(() => { interaction.current = null; setScrub(null); }, [trackId]);
  const commit = () => { interaction.current = null; if (scrub !== null) { onSeek(Math.min(max, Math.max(0, scrub))); setScrub(null); } };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const change = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -5 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 5 : 0;
    if (change || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      interaction.current = "keyboard";
      setScrub(event.key === "Home" ? 0 : event.key === "End" ? max : Math.min(max, Math.max(0, value + change)));
    }
  };
  return <div className="playback-timeline" data-on-art={onArt || undefined}>
    <div className="playback-track">
      <input type="range" aria-label="Seek" aria-valuetext={`${fmtTime(value)} of ${fmtTime(max)}`} min={0} max={max || 1} step={.1} value={value} disabled={!max}
        onPointerDown={() => { interaction.current = "pointer"; }} onChange={event => {
          const next = Number(event.target.value);
          if (interaction.current) setScrub(next); else onSeek(Math.min(max, Math.max(0, next)));
        }} onPointerUp={commit} onPointerCancel={() => { interaction.current = null; setScrub(null); }} onKeyDown={onKeyDown} onKeyUp={commit} onBlur={commit} />
      <span className="playback-track-bar" aria-hidden="true">
        <span className="playback-track-fill" style={{ "--progress": `${max ? value / max * 100 : 0}%` } as CSSProperties} />
      </span>
    </div>
    <div className="playback-times" aria-hidden="true"><span>{fmtTime(value)}</span><span>−{fmtTime(Math.max(0, max - value))}</span></div>
  </div>;
}
