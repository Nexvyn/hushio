import { useEffect, useRef } from "react";
import { House, Books, MagnifyingGlass, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { TAB_BAR_DP, TABS, type TabId } from "../../lib/phoneNav";
import { t, useT } from "../../lib/i18n";
import { useNavigation, type View } from "../../stores/navigation";
import { haptic } from "../../lib/haptics";
import { motion } from "motion/react";
import { PHONE_MS, gate, phoneTween, reducedMotion } from "../../lib/motion";
import { LongPress } from "../../lib/longPress";
import { LONG_HOLD_MS } from "../../lib/phoneGestures";

function focusPhoneSearch(attempts = 12): void {
  const field = document.getElementById("phone-search");
  if (field) {
    field.focus();
    return;
  }
  if (attempts > 0) requestAnimationFrame(() => focusPhoneSearch(attempts - 1));
}

const ICONS: Record<TabId, PhosphorIcon> = {
  home: House,
  search: MagnifyingGlass,
  library: Books,
};

export function TabBar({ activeTab }: { activeTab?: TabId | null } = {}) {
  useT();
  const current = useNavigation((state) => activeTab === undefined ? state.tab : activeTab);
  const navigate = useNavigation((state) => state.navigate);
  const reduced = reducedMotion();
  const searchPress = useRef<LongPress | null>(null);
  const longFired = useRef(false);
  if (searchPress.current === null) {
    searchPress.current = new LongPress(() => {
      longFired.current = true;
      haptic("select");
      const search = TABS.find((tab) => tab.id === "search");
      if (search) navigate(search.view);
      focusPhoneSearch();
    }, LONG_HOLD_MS);
  }

  useEffect(() => () => searchPress.current?.cancel(), []);

  const tap = (tab: { id: TabId; view: View }) => {
    if (tab.id === current) {
      haptic("tick");
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
      className="relative z-20 flex shrink-0 bg-surface text-ink-1"
      style={{ height: TAB_BAR_DP }}
    >
      {TABS.map((tab) => {
        const active = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (longFired.current) {
                longFired.current = false;
                return;
              }
              tap(tab);
            }}
            onPointerDown={(event) => {
              if (tab.id !== "search") return;
              longFired.current = false;
              searchPress.current?.start({ x: event.clientX, y: event.clientY });
            }}
            onPointerMove={(event) => searchPress.current?.move({ x: event.clientX, y: event.clientY })}
            onPointerUp={() => searchPress.current?.cancel()}
            onPointerCancel={() => searchPress.current?.cancel()}
            onPointerLeave={() => searchPress.current?.cancel()}
            className={`group relative flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              active ? "text-ink-1" : "text-ink-2"
            }`}
          >
            <span className="flex flex-col items-center gap-1 motion-safe:transition-opacity motion-safe:duration-press group-active:opacity-60">
              <PhoneIcon icon={ICONS[tab.id]} weight={active ? "fill" : "regular"} />
              <motion.span
                key={String(active)}
                initial={{ opacity: active && !reduced ? 0.4 : 1 }}
                animate={{ opacity: 1 }}
                transition={gate(reduced, phoneTween(PHONE_MS.tab))}
                className={`text-caption leading-[14px] ${active ? "font-semibold" : "font-medium"}`}
              >
                {t(tab.labelKey)}
              </motion.span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
