import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";

type IconProps = {
  icon: PhosphorIcon;
  weight?: IconWeight;
  fill?: string;
  size?: number;
};

export function Icon({ icon: Glyph, weight, fill = "none", size = 20 }: IconProps) {
  return <Glyph size={size} weight={weight ?? (fill === "none" ? "regular" : "fill")} aria-hidden />;
}
