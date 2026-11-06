import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon, Compass01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { CaptionButtons } from "./CaptionButtons";
import { Icon } from "./Icon";
import { SearchSuggestions, optionId, useTypeAhead } from "./SearchSuggestions";
import { StreakChip } from "./StreakChip";
import { UpdateChip } from "./UpdateChip";
import { platform } from "../lib/bridge";
import { hasCaptionButtons } from "../lib/desktopPlatform";
import { openSuggestion, submitSearch } from "../lib/searchActions";
import type { SuggestionRow } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const circleButton =
  "hit-area flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink-1/[0.06] hover:text-ink-1 disabled:pointer-events-none disabled:opacity-[var(--disabled-opacity)]";

export function TopBar() {
  const view = useNavigation((state) => state.view);
  const navPast = useNavigation((state) => state.navPast);
  const navFuture = useNavigation((state) => state.navFuture);
  const navigate = useNavigation((state) => state.navigate);
  const goBack = useNavigation((state) => state.goBack);
  const goForward = useNavigation((state) => state.goForward);
  const searchQuery = useUI((state) => state.searchQuery);
  const setSearchQuery = useUI((state) => state.setSearchQuery);

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rows = useTypeAhead(searchQuery, focused);
  const open = focused && rows.length > 0;

  const close = () => {
    setFocused(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const pick = (row: SuggestionRow) => {
    openSuggestion(row, searchQuery);
    close();
  };

  const submitTyped = () => {
    submitSearch(searchQuery);
    close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" && open) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, rows.length));
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(-1, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = open && activeIndex >= 1 ? rows[activeIndex - 1] : undefined;
      if (picked) pick(picked);
      else submitTyped();
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="flex h-14 shrink-0 items-center gap-3 px-3"
    >
      <button
        type="button"
        data-intro-target
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

      <div className="relative ml-2 min-w-0 max-w-[420px] flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
          <Icon icon={Search01Icon} />
        </span>
        <input
          ref={inputRef}
          id="global-search"
          type="search"
          role="combobox"
          aria-label="Search"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(listId, activeIndex) : undefined}
          aria-autocomplete="list"
          placeholder="What do you want to play?"
          maxLength={200}
          spellCheck={false}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-full border border-separator bg-surface pl-10 pr-3 text-[13px] text-ink-1 placeholder:text-ink-2"
        />
        {open && (
          <SearchSuggestions
            listId={listId}
            query={searchQuery}
            rows={rows}
            activeIndex={activeIndex}
            onPick={pick}
            onFill={(text) => {
              setSearchQuery(text);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            onSubmitTyped={submitTyped}
          />
        )}
      </div>

      <UpdateChip />
      <StreakChip />

      {hasCaptionButtons(platform) ? <CaptionButtons /> : null}
    </header>
  );
}
