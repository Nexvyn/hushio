import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "border border-separator bg-transparent text-ink-1 hover:bg-hover",
  ghost: "bg-transparent text-ink-1 hover:bg-hover",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`app-control inline-flex h-10 min-h-10 [@media(pointer:coarse)]:min-h-11 items-center justify-center rounded-full px-5 text-body font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-[background-color,color,transform,opacity,box-shadow] motion-safe:duration-quick motion-safe:ease-out motion-safe:enabled:active:scale-[0.97] ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
