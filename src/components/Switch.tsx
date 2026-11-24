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
      className={`hit-area inline-flex h-6 w-11 shrink-0 items-center rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:cursor-not-allowed disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out ${
        checked ? "bg-ink-1" : "bg-ink-1/[0.5]"
      } ${className}`}
      {...props}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={`block size-4 rounded-full motion-safe:transition-transform motion-safe:duration-swap [transition-timing-function:var(--ease-settle)] ${
          checked ? "translate-x-5 bg-base" : "bg-white"
        }`}
      />
    </button>
  );
}
