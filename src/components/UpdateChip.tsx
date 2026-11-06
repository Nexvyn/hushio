import { Download04Icon, RotateClockwiseIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "./Icon";
import { chipModel, type ChipModel } from "../lib/updates";
import { useNavigation } from "../stores/navigation";
import { useUpdates } from "../stores/updates";

const ICONS: Record<NonNullable<ChipModel["icon"]>, IconSvgElement> = {
  download: Download04Icon,
  restart: RotateClockwiseIcon,
};

export function UpdateChip() {
  const state = useUpdates((store) => store.state);
  const install = useUpdates((store) => store.install);
  const restart = useUpdates((store) => store.restart);
  const navigate = useNavigation((store) => store.navigate);

  const model = chipModel(state);
  if (!model) return null;

  const onClick = () => {
    if (model.action === "install") void install();
    else if (model.action === "restart") void restart();
    else navigate({ name: "settings", param: "about" });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="update-chip hit-area flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-[13px] font-bold text-on-accent motion-safe:transition-transform motion-safe:duration-quick motion-safe:hover:scale-[1.04] motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
    >
      {model.icon && <Icon icon={ICONS[model.icon]} />}
      {model.label}
    </button>
  );
}
