import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export function PhoneIcon({ icon, size = 24, fill = "none" }: { icon: IconSvgElement; size?: number; fill?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={2} fill={fill} />;
}
