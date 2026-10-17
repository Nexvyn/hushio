import type { IconSvgElement } from "@hugeicons/react";
import {
  Download01Icon,
  FavouriteIcon,
  LibraryIcon,
  MusicNote01Icon,
  MusicNote03Icon,
  ReplayIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { useNavigation, type View } from "../stores/navigation";

type SidebarRow = {
  label: string;
  subtitle: string;
  icon: IconSvgElement;
  view: View;
};

const rows: SidebarRow[] = [
  {
    label: "Liked Songs",
    subtitle: "Playlist · 0 tracks",
    icon: FavouriteIcon,
    view: { name: "library", param: "liked" },
  },
  {
    label: "Import",
    subtitle: "Connect your playlists",
    icon: MusicNote03Icon,
    view: { name: "import" },
  },
  {
    label: "Replay",
    subtitle: "Your listening stats",
    icon: ReplayIcon,
    view: { name: "replay" },
  },
  {
    label: "Downloads",
    subtitle: "Playlist · 0 tracks",
    icon: Download01Icon,
    view: { name: "downloads" },
  },
  {
    label: "Local music",
    subtitle: "On this device",
    icon: MusicNote01Icon,
    view: { name: "local" },
  },
];

export function Sidebar() {
  const view = useNavigation((state) => state.view);
  const navigate = useNavigation((state) => state.navigate);

  return (
    <aside className="shell-sidebar flex w-[328px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-5 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate({ name: "library" })}
          className="flex items-center gap-2 text-[14px] font-semibold text-ink-2 transition-colors hover:text-ink-1"
        >
          <Icon icon={LibraryIcon} />
          Your Library
        </button>
      </div>

      <nav aria-label="Library" className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
        <ul className="space-y-0.5">
          {rows.map((row) => {
            const current =
              view.name === row.view.name &&
              (row.view.param ? view.param === row.view.param : true);

            return (
              <li key={row.label}>
                <button
                  type="button"
                  aria-current={current ? "page" : undefined}
                  onClick={() => navigate(row.view)}
                  className={`flex w-full items-center gap-3 rounded-[9px] p-2 text-left transition-colors ${
                    current
                      ? "bg-ink-1/[0.08]"
                      : "hover:bg-ink-1/[0.05] active:bg-ink-1/[0.1]"
                  }`}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[9px] bg-ink-1/[0.06] text-ink-2">
                    <Icon icon={row.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink-1">
                      {row.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
                      {row.subtitle}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
