import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence } from "motion/react";
import { X, MagnifyingGlass } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { SearchSuggestions, optionId, useTypeAhead } from "../SearchSuggestions";
import { openSuggestion, submitSearch } from "../../lib/searchActions";
import { INSET_TOP } from "../../lib/phoneNav";
import type { SuggestionRow } from "../../lib/searchParse";
import { useRecents } from "../../stores/recents";
import { useUI } from "../../stores/ui";

const RECENT_LIMIT = 6;

export function PhoneSearchField({ suggest = true }: { suggest?: boolean }) {
  const query = useUI((state) => state.searchQuery);
  const setSearchQuery = useUI((state) => state.setSearchQuery);
  const focused = useUI((state) => state.searchFocused);
  const setFocused = useUI((state) => state.setSearchFocused);
  const recents = useRecents((state) => state.searches);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const typed = query.trim();
  const typeRows = useTypeAhead(query, focused && suggest);
  const recentRows: SuggestionRow[] = recents.slice(0, RECENT_LIMIT).map((text) => ({ kind: "completion", text }));
  const rows = typed ? typeRows : recentRows;
  const open = focused && suggest && (typed.length > 0 || rows.length > 0);

  useEffect(() => () => setFocused(false), [setFocused]);

  useEffect(() => {
    if (!focused) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) inputRef.current?.blur();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [focused]);

  const close = () => {
    setFocused(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const pick = (row: SuggestionRow) => {
    openSuggestion(row, query);
    close();
  };

  const submitTyped = () => {
    if (typed) submitSearch(query);
    close();
  };

  const clear = () => {
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
    <div ref={rootRef}>
      <div className="sticky z-20 -mx-4 bg-base px-4 py-2" style={{ top: INSET_TOP }}>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-ink-2">
          <PhoneIcon icon={MagnifyingGlass} />
        </span>
        <input
          ref={inputRef}
          id="phone-search"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-label="Search"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(listId, activeIndex) : undefined}
          aria-autocomplete="list"
          inputMode="search"
          enterKeyHint="search"
          placeholder="What do you want to play?"
          maxLength={200}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          value={query}
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
          className="h-11 w-full rounded-field border-0 bg-wash pl-12 pr-12 text-[16px] text-ink-1 placeholder:text-ink-2 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            title="Clear search"
            onClick={clear}
            className="absolute right-1.5 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <PhoneIcon icon={X} />
          </button>
        )}
      </div>
      </div>
      <AnimatePresence>
        {open && (
          <SearchSuggestions
            inline
            listId={listId}
            query={query}
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
  );
}
