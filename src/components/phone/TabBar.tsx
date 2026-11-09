import { motion } from "motion/react";
import {
  Download01Icon,
  Home01Icon,
  LibraryIcon,
  Search01Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "../Icon";
import { gate, reducedMotion, settle } from "../../lib/motion";
import { INSET_BOTTOM, TAB_BAR_DP, TABS, type TabId, tabFor } from "../../lib/phoneNav";
import { useNavigation } from "../../stores/navigation";

const ICONS: Record<TabId, IconSvgElement> = {
  home: Home01Icon,
  search: Search01Icon,
  library: LibraryIcon,
  downloads: Download01Icon,
  settings: Settings02Icon,
};

export function TabBar() {
  const current = useNavigation((state) => tabFor(state.view));
  const navigate = useNavigation((state) => state.navigate);
  const reduced = reducedMotion();

  return (
    <nav
      aria-label="Main"
      className="relative z-20 flex shrink-0 border-t border-separator bg-base"
      style={{ height: `calc(${TAB_BAR_DP}px + ${INSET_BOTTOM})`, paddingBottom: INSET_BOTTOM }}
    >
      {TABS.map((tab) => {
        const active = tab.id === current;
        const tone = active ? "text-ink-1" : "text-ink-2";
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => navigate(tab.view)}
            className="flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="relative grid h-8 w-14 place-items-center">
              {active && (
                <motion.span
                  layoutId="tab-capsule"
                  aria-hidden="true"
                  transition={gate(reduced, settle)}
                  className="absolute inset-0 rounded-full bg-selected"
                />
              )}
              <span className={`relative grid place-items-center ${tone}`}>
                <Icon icon={ICONS[tab.id]} />
              </span>
            </span>
            <span className={`text-[11.5px] font-medium leading-[14px] ${tone}`}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
