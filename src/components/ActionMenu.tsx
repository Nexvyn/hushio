import { useEffect, useId, useRef, useState } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";

export type MenuItem = {
  label: string;
  icon: IconSvgElement;
  onSelect?: () => void;
  disabled?: boolean;
  separatorBefore?: boolean;
};

type ActionMenuProps = {
  items: MenuItem[];
  label: string;
  triggerClass?: string;
};

const TRIGGER =
  "flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink-1 motion-safe:transition-colors";

export function ActionMenu({ items, label, triggerClass = TRIGGER }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={triggerClass}
      >
        <Icon icon={MoreHorizontalIcon} />
      </button>
      {open && (
        <ul
          id={menuId}
          className="absolute right-0 z-30 mt-1 min-w-[200px] overflow-hidden rounded-[11px] bg-panel py-1 shadow-[var(--shadow-card)]"
        >
          {items.map((item) => (
            <li key={item.label} className={item.separatorBefore ? "mt-1 border-t border-card-edge/[0.08] pt-1" : ""}>
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] text-ink-1 hover:bg-wash disabled:opacity-[var(--disabled-opacity)]"
              >
                <Icon icon={item.icon} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
