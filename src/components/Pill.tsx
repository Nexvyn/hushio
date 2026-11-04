import type { ButtonHTMLAttributes } from "react";

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function Pill({ active = false, className = "", ...props }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-[11.5px] font-medium disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out ${
        active ? "bg-accent text-on-accent" : "bg-wash text-ink-2 hover:bg-hover"
      } ${className}`}
      {...props}
    />
  );
}
