import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  secondary: "bg-wash text-ink-1 hover:bg-hover",
  ghost: "bg-transparent text-ink-1 hover:bg-hover",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-[9px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
