import { MusicNote01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { upgradeArtwork } from "../lib/artwork";

export function RowThumb({ src, size = 48 }: { src: string | null | undefined; size?: number }) {
  const url = src ? upgradeArtwork(src, 120) : null;
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[9px] bg-wash text-ink-2"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <Icon icon={MusicNote01Icon} />
      )}
    </span>
  );
}
