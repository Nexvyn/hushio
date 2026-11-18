import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";

export function PhoneIcon({
  icon: Glyph,
  size = 24,
  weight,
  fill = "none",
}: {
  icon: PhosphorIcon;
  size?: number;
  weight?: IconWeight;
  fill?: string;
}) {
  return <Glyph size={size} weight={weight ?? (fill === "none" ? "regular" : "fill")} aria-hidden />;
}
