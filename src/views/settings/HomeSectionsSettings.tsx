import { useRef } from "react";
import { DotsSixVertical } from "@phosphor-icons/react";
import { Icon } from "../../components/Icon";
import { Switch } from "../../components/Switch";
import { HOME_SECTION_KEYS, moveHomeSection, toggleHiddenSection } from "../../lib/homeSections";
import { useSortable } from "../../lib/useSortable";
import { useNavigation } from "../../stores/navigation";
import { useSettings } from "../../stores/settings";
import { PageHeader } from "./SettingsLayout";

const LABELS: Record<string, string> = {
  "jump-back-in": "Jump back in",
  "playlists-for-you": "Playlists for you",
  browse: "Browse",
  "your-mixes": "Your mixes",
  "heavy-rotation": "Heavy rotation",
  "favorite-artists": "Favourite artists",
  "more-like": "More like this",
  "recommended-today": "Recommended for today",
  "new-from-your-artists": "New from your artists",
  "dust-off": "Dust off",
  stations: "Stations",
  "albums-for-you": "Albums for you",
  because: "Because you listened",
  market: "From your region",
};

function labelOf(key: string): string {
  return LABELS[key] ?? key;
}

export function HomeSectionsSettings() {
  const navigate = useNavigation((state) => state.navigate);
  const order = useSettings((state) => state.homeSectionOrder);
  const hidden = useSettings((state) => state.hiddenHomeSections);
  const setValue = useSettings((state) => state.setValue);
  const listRef = useRef<HTMLUListElement>(null);

  const keys = order.length > 0 ? order : [...HOME_SECTION_KEYS];
  const sortable = useSortable({
    keys,
    listRef,
    onMove: (from, to) => setValue("homeSectionOrder", moveHomeSection(keys, from, to)),
  });

  return (
    <div className="max-w-[680px] pb-8">
      <PageHeader
        title="Home sections"
        note="Drag to reorder the sections on Home. Turn one off to hide it."
        onBack={() => navigate({ name: "settings", param: "display" })}
      />

      <ul ref={listRef} className="divide-y divide-separator" {...sortable.listProps}>
        {keys.map((key) => {
          const bound = sortable.bind(key);
          const shown = !hidden.includes(key);
          return (
            <li key={key} {...bound} className="flex min-h-[52px] items-center gap-3 py-2">
              <span aria-hidden="true" className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-ink-2">
                <Icon icon={DotsSixVertical} />
              </span>
              <span className="min-w-0 flex-1 truncate text-body font-medium text-ink-1">{labelOf(key)}</span>
              <span data-no-drag>
                <Switch
                  checked={shown}
                  aria-label={`Show ${labelOf(key)}`}
                  onCheckedChange={() => setValue("hiddenHomeSections", toggleHiddenSection(hidden, key))}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
