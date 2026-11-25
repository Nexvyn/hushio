import type { ButtonHTMLAttributes } from "react";
import { Play } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";

const PHONE_ROUND =
  "grid size-14 shrink-0 place-items-center rounded-full bg-[color:var(--hero-play-bg,rgb(var(--primary)))] text-[color:var(--hero-play-ink,rgb(var(--on-primary)))] hover:opacity-90 motion-safe:transition-[transform,opacity] motion-safe:duration-press motion-safe:active:scale-[0.97] disabled:opacity-[var(--disabled-opacity)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const DESKTOP_ROUND =
  "grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-float hover:opacity-90 motion-safe:transition-[transform,opacity] motion-safe:active:scale-[0.97] disabled:opacity-[var(--disabled-opacity)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

type PlayRoundProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { phone?: boolean };

export function PlayRound({ phone = false, className = "", ...props }: PlayRoundProps) {
  const label = props["aria-label"] ?? "Play";
  return (
    <button type="button" title={label} {...props} aria-label={label} className={`${phone ? PHONE_ROUND : DESKTOP_ROUND} ${className}`}>
      {phone ? <PhoneIcon icon={Play} /> : <Icon icon={Play} />}
    </button>
  );
}
