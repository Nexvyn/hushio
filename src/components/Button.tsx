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
      className={`inline-flex items-center justify-center h-10 rounded-[12px] [corner-shape:squircle] px-4 text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-[background-color,color,transform] motion-safe:duration-quick motion-safe:ease-out motion-safe:active:scale-[0.97] ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
