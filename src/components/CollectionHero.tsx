import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "./Icon";

const ROW_SECONDS = [110, 140, 170];
const ROW_LENGTH = 8;

type CollectionHeroProps = {
  icon: IconSvgElement;
  kind: string;
  title: string;
  covers: string[];
  facts: ReactNode;
  children: ReactNode;
};

function wallRow(covers: string[], offset: number): string[] {
  const cycle = Array.from({ length: ROW_LENGTH }, (_, index) => covers[(index + offset) % covers.length]);
  return [...cycle, ...cycle];
}

export function CollectionHero({ icon, kind, title, covers, facts, children }: CollectionHeroProps) {
  const rows = covers.length > 0 ? ROW_SECONDS.map((seconds, index) => ({ seconds, index, images: wallRow(covers, index) })) : [];

  return (
    <section className="relative -mx-10 -mt-5 h-[300px] overflow-hidden bg-wash">
      <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-center gap-2 overflow-hidden">
        {rows.map((row) => (
          <div
            key={row.index}
            className="cover-wall-row flex w-max"
            style={{
              animationDuration: `${row.seconds}s`,
              animationDirection: row.index % 2 === 1 ? "reverse" : "normal",
            }}
          >
            {row.images.map((src, index) => (
              <img key={index} src={src} alt="" className="mr-2 h-24 w-24 shrink-0 rounded-md object-cover" />
            ))}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-base" />
      <div className="absolute inset-x-10 bottom-0 pb-8 text-white drop-shadow">
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">
          <Icon icon={icon} />
          {kind}
        </p>
        <h1 className="mt-1 text-[40px] font-extrabold leading-[1.1] tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-[13px] text-white/70">{facts}</p>
        <div className="mt-4 flex items-center gap-2.5">{children}</div>
      </div>
    </section>
  );
}
