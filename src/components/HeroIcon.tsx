import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import { usePhone } from "../lib/usePhone";

export function HeroIcon({ icon }: { icon: IconSvgElement }) {
  const phone = usePhone();
  return phone ? <PhoneIcon icon={icon} /> : <Icon icon={icon} />;
}
