import { VinylRecord } from "@phosphor-icons/react";
import { Icon } from "./Icon";

const TILES = 12;
const STEP = 360 / TILES;
const RADIUS = 220;

type CoverDrumProps = { turn: number; spinning: boolean };

export function CoverDrum({ turn, spinning }: CoverDrumProps) {
  return (
    <div aria-hidden="true" className="relative h-[360px] w-[360px] [perspective:1000px]">
      <div
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{
          transform: `rotateX(-8deg) rotateY(${-turn * STEP}deg)`,
          transition: "transform var(--dur-settle) var(--ease-settle)",
        }}
      >
        <div className={`absolute inset-0 [transform-style:preserve-3d] ${spinning ? "bt-drum-spin" : ""}`}>
          {Array.from({ length: TILES }, (_, index) => (
            <div
              key={index}
              className="absolute left-1/2 top-1/2 flex h-[132px] w-[96px] items-center justify-center rounded-xl border border-separator bg-wash text-ink-2"
              style={{ transform: `translate(-50%, -50%) rotateY(${index * STEP}deg) translateZ(${RADIUS}px)` }}
            >
              <Icon icon={VinylRecord} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
