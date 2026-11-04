import type { ButtonHTMLAttributes } from "react";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({ checked, onCheckedChange, className = "", ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-1 disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out ${
        checked ? "bg-primary" : "bg-wash"
      } ${className}`}
      {...props}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={`block size-4 rounded-full motion-safe:transition-transform motion-safe:duration-quick motion-safe:ease-out ${
          checked ? "translate-x-5 bg-on-primary" : "bg-ink-1"
        }`}
      />
    </button>
  );
}
