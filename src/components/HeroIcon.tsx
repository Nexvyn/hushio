import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import { usePhone } from "../lib/usePhone";

export function HeroIcon({ icon }: { icon: PhosphorIcon }) {
  const phone = usePhone();
  return phone ? <PhoneIcon icon={icon} /> : <Icon icon={icon} />;
}
