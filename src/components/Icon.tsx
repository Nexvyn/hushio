import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

type IconProps = {
  icon: IconSvgElement;
};

export function Icon({ icon }: IconProps) {
  return <HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} />;
}
