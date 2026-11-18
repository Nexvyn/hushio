import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence } from "motion/react";
import { CaretLeft, CaretRight, X, House, MagnifyingGlass } from "@phosphor-icons/react";
import { CaptionButtons } from "./CaptionButtons";
import { Icon } from "./Icon";
import { AppLogo } from "./AppLogo";
import { ProfileButton } from "./ProfileButton";
import { SearchSuggestions, optionId, useTypeAhead } from "./SearchSuggestions";
import { ThemeButton } from "./ThemeButton";
import { UpdateChip } from "./UpdateChip";
import { platform } from "../lib/bridge";
import { hasCaptionButtons } from "../lib/desktopPlatform";
import { openSuggestion, submitSearch } from "../lib/searchActions";
import { topBarLeadingInset } from "../lib/windowChrome";
import type { SuggestionRow } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const squircleButton =
  "hit-area grid h-9 w-9 shrink-0 place-items-center rounded-[12px] [corner-shape:squircle] text-ink-2 motion-safe:transition-colors lifted-hover hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-[var(--disabled-opacity)]";

const liftedButton =
  "hit-area grid h-9 w-9 shrink-0 place-items-center rounded-full border lifted-edge outline-none text-ink-2 motion-safe:transition-colors hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

const liftedFill = "lifted-fill";

const fieldInput =
  "relative z-[60] h-9 w-full rounded-field bg-wash pl-11 text-body text-ink-1 placeholder:text-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-focus data-[open=true]:bg-transparent motion-safe:transition-colors";

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
  const viewName = view.name;
  const previousView = useRef(viewName);
  useEffect(() => {
    if (previousView.current === "search" && viewName !== "search") setSearchQuery("");
    previousView.current = viewName;
  }, [viewName, setSearchQuery]);
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

  const clearSearch = () => {
    setSearchQuery("");
    setActiveIndex(-1);
    inputRef.current?.focus();
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
        className="app-toolbar grid h-[52px] shrink-0 bg-base grid-cols-[auto_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_minmax(300px,520px)_minmax(0,1fr)] items-center gap-3 py-1.5 pl-3 pr-4"
      style={{ paddingLeft: topBarLeadingInset(platform) }}
    >
      <div data-tauri-drag-region className="flex items-center gap-1 justify-self-start">
        <span className="mr-2 flex items-center">
          <AppLogo size={28} introTarget />
        </span>
        <button
          type="button"
          aria-label="Back"
          title="Back"
          disabled={navPast.length === 0}
          onClick={goBack}
          className={squircleButton}
        >
          <Icon icon={CaretLeft} />
        </button>
        <button
          type="button"
          aria-label="Forward"
          title="Forward"
          disabled={navFuture.length === 0}
          onClick={goForward}
          className={squircleButton}
        >
          <Icon icon={CaretRight} />
        </button>
      </div>

      <div data-tauri-drag-region data-testid="topbar-centre" className="flex min-w-0 items-center justify-center gap-2">
        <button
          type="button"
          aria-label="Home"
          title="Home"
          aria-current={view.name === "home" ? "page" : undefined}
          onClick={() => navigate({ name: "home" })}
          className={`${liftedButton} ${view.name === "home" ? "lifted-tint text-ink-1" : liftedFill}`}
        >
          <Icon icon={House} />
        </button>

        <div className="relative min-w-0 w-full max-w-[474px]">
          <span className="pointer-events-none absolute left-3.5 top-1/2 z-[60] -translate-y-1/2 text-ink-2">
            <Icon icon={MagnifyingGlass} />
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
            data-open={open ? "true" : undefined}
            className={`${fieldInput} ${searchQuery ? "pr-[4.25rem]" : "pr-10"}`}
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              title="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearSearch}
              className="hit-area absolute right-[44px] top-1/2 z-[60] grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[9px] [corner-shape:squircle] text-ink-2 motion-safe:transition-colors hover:bg-hover hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Icon icon={X} />
            </button>
          )}
          <AnimatePresence>
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
          </AnimatePresence>
        </div>
      </div>

      <div data-tauri-drag-region className="flex h-full items-center justify-self-end gap-2">
        <UpdateChip />
        <ThemeButton className={squircleButton} />
        <ProfileButton />
        {hasCaptionButtons(platform) ? <CaptionButtons variant="compact" /> : null}
      </div>
    </header>
  );
}
