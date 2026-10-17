import type { HTMLAttributes } from "react";

export function Badge({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center rounded-[6px] bg-wash px-1.5 py-0.5 text-[10.5px] font-medium text-ink-2 ${className}`}
      {...props}
    />
  );
}
