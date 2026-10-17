import { MusicNote01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";

export function RightRail() {
  return (
    <aside
      aria-label="Now playing panel"
      className="shell-rail flex w-[328px] shrink-0 flex-col overflow-hidden"
    >
      <div className="px-3 py-3">
        <p className="px-0.5 text-[12.5px] font-semibold text-ink-2">Nothing playing yet</p>
        <div className="mt-3 flex aspect-square w-full items-center justify-center rounded-xl bg-ink-1/[0.04] text-ink-3">
          <Icon icon={MusicNote01Icon} />
        </div>
      </div>
    </aside>
  );
}
