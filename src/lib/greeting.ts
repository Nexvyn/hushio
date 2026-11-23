import { t } from "./i18n";
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return t("home.greetingMorning");
  if (hour >= 12 && hour < 17) return t("home.greetingAfternoon");
  return t("home.greetingEvening");
}
