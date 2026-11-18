import { ChartBar, ChartLine, ClockCounterClockwise, DownloadSimple, Heart, MusicNote, Sparkle, Sun, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { type View, useNavigation } from "../stores/navigation";

export type BrowseItem = { label: string; icon: PhosphorIcon; view: View };

const DESKTOP_TILE =
  "flex h-14 w-full min-w-0 items-center gap-3 rounded-[12px] bg-wash px-3.5 text-left text-body text-ink-1 motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out hover:bg-hover active:bg-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

const DESKTOP_HEADING = "text-section text-ink-1";

export const DESKTOP_BROWSE: readonly BrowseItem[] = [
  { label: "Charts", icon: ChartLine, view: { name: "charts" } },
  { label: "New releases", icon: Sparkle, view: { name: "newreleases" } },
  { label: "Daylist", icon: Sun, view: { name: "daylist" } },
  { label: "Replay", icon: ChartBar, view: { name: "replay" } },
  { label: "History", icon: ClockCounterClockwise, view: { name: "history" } },
  { label: "Liked Songs", icon: Heart, view: { name: "library", param: "liked" } },
  { label: "Downloads", icon: DownloadSimple, view: { name: "downloads" } },
  { label: "Local music", icon: MusicNote, view: { name: "local" } },
];

export function BrowseGrid({ items }: { items: readonly BrowseItem[] }) {
  const navigate = useNavigation((state) => state.navigate);
  return (
    <section className="space-y-3">
      <h2 className={DESKTOP_HEADING}>Browse all</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
        {items.map((item) => (
          <button key={item.label} type="button" onClick={() => navigate(item.view)} className={DESKTOP_TILE}>
            <span aria-hidden="true" className="shrink-0 text-accent">
              <Icon icon={item.icon} />
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
