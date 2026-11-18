import { CircleNotch, Pause, Play } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { SwapGlyph } from "../motion/SwapGlyph";
import { reducedMotion } from "../../lib/motion";
import { usePageVisible } from "../../lib/usePageVisible";

export function useLoopAllowed(): boolean {
  const visible = usePageVisible();
  return visible && !reducedMotion();
}

function Spinner({ size = 24 }: { size?: number }) {
  const loop = useLoopAllowed();
  return (
    <span className={loop ? "grid animate-spin place-items-center" : "grid place-items-center"}>
      <PhoneIcon icon={CircleNotch} size={size} />
    </span>
  );
}

export function PlayPauseGlyph({ playing, buffering, size = 24 }: { playing: boolean; buffering: boolean; size?: number }) {
  if (buffering) return <Spinner size={size} />;
  return (
    <SwapGlyph swapKey={playing ? "pause" : "play"}>
      <PhoneIcon icon={playing ? Pause : Play} size={size} />
    </SwapGlyph>
  );
}
