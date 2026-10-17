import { ArrowLeft01Icon, ArrowRight01Icon, Compass01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { useNavigation } from "../stores/navigation";

const circleButton =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink-1/[0.06] hover:text-ink-1 disabled:pointer-events-none disabled:opacity-30";

export function TopBar() {
  const view = useNavigation((state) => state.view);
  const navPast = useNavigation((state) => state.navPast);
  const navFuture = useNavigation((state) => state.navFuture);
  const navigate = useNavigation((state) => state.navigate);
  const goBack = useNavigation((state) => state.goBack);
  const goForward = useNavigation((state) => state.goForward);

  return (
    <header
      data-tauri-drag-region
      className="flex h-14 shrink-0 items-center gap-3 px-3"
    >
      <button
        type="button"
        onClick={() => navigate({ name: "home" })}
        className="rounded-[9px] px-2 py-1 text-[14px] font-semibold text-ink-1 transition-colors hover:bg-ink-1/[0.06]"
      >
        Hushio
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Back"
          title="Back"
          disabled={navPast.length === 0}
          onClick={goBack}
          className={circleButton}
        >
          <Icon icon={ArrowLeft01Icon} />
        </button>
        <button
          type="button"
          aria-label="Forward"
          title="Forward"
          disabled={navFuture.length === 0}
          onClick={goForward}
          className={circleButton}
        >
          <Icon icon={ArrowRight01Icon} />
        </button>
      </div>

      <button
        type="button"
        aria-label="Explore"
        title="Explore"
        aria-current={view.name === "explore" ? "page" : undefined}
        onClick={() => navigate({ name: "explore" })}
        className={`${circleButton} ${view.name === "explore" ? "bg-ink-1/[0.1] text-ink-1" : ""}`}
      >
        <Icon icon={Compass01Icon} />
      </button>
    </header>
  );
}
