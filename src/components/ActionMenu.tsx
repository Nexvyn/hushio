import { useId } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { type MenuSource, resolveMenu } from "./ContextMenu";
import { useUI } from "../stores/ui";

type ActionMenuProps = {
  items: MenuSource;
  label: string;
  triggerClass?: string;
  icon?: IconSvgElement;
  triggerText?: string;
  disabled?: boolean;
  placement?: "up" | "down";
};

const TRIGGER =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function ActionMenu({
  items,
  label,
  triggerClass = TRIGGER,
  icon = MoreHorizontalIcon,
  triggerText,
  disabled = false,
  placement = "down",
}: ActionMenuProps) {
  const owner = useId();
  const open = useUI((state) => state.contextMenu?.owner === owner);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={disabled}
      onPointerDown={(event) => {
        if (open) event.stopPropagation();
      }}
      onClick={(event) => {
        const ui = useUI.getState();
        if (ui.contextMenu?.owner === owner) {
          ui.closeContextMenu();
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const up = placement === "up";
        ui.openContextMenu(up ? rect.left : rect.right, up ? rect.top : rect.bottom + 6, resolveMenu(items), {
          owner,
          above: up,
          alignRight: !up,
        });
      }}
      className={`${triggerClass} disabled:opacity-[var(--disabled-opacity)]`}
    >
      <Icon icon={icon} />
      {triggerText}
    </button>
  );
}
