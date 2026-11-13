import type { IconSvgElement } from "@hugeicons/react";
import { Home01Icon, LibraryIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { PhoneIcon } from "./PhoneIcon";
import { INSET_BOTTOM, TAB_BAR_DP, TABS, type TabId, tabFor } from "../../lib/phoneNav";
import { useNavigation, type View } from "../../stores/navigation";
import { haptic } from "../../lib/haptics";
import { reducedMotion } from "../../lib/motion";

const ICONS: Record<TabId, IconSvgElement> = {
  home: Home01Icon,
  search: Search01Icon,
  library: LibraryIcon,
};

export function TabBar() {
  const current = useNavigation((state) => tabFor(state.view));
  const navigate = useNavigation((state) => state.navigate);
  const reduced = reducedMotion();

  const tap = (tab: { id: TabId; view: View }) => {
    if (tab.id === current) {
      navigate(tab.view);
      document.getElementById("view-scroll")?.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      return;
    }
    haptic("tick");
    navigate(tab.view);
  };

  return (
    <nav
      aria-label="Main"
      className="relative z-20 flex shrink-0 bg-base"
      style={{ height: `calc(${TAB_BAR_DP}px + ${INSET_BOTTOM})`, paddingBottom: INSET_BOTTOM }}
    >
      {TABS.map((tab) => {
        const active = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => tap(tab)}
            className={`group flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              active ? "text-accent" : "text-ink-2"
            }`}
          >
            <span className="flex flex-col items-center gap-1 motion-safe:transition-transform motion-safe:duration-fade motion-safe:ease-out motion-safe:group-active:scale-[0.96]">
              <PhoneIcon icon={ICONS[tab.id]} />
              <span className={`text-[12px] leading-4 ${active ? "font-semibold" : "font-medium"}`}>{tab.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
