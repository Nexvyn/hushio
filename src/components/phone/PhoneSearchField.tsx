import { useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence } from "motion/react";
import { Cancel01Icon, Mic01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { PhoneIcon } from "./PhoneIcon";
import { SearchSuggestions, optionId, useTypeAhead } from "../SearchSuggestions";
import { openSuggestion, submitSearch } from "../../lib/searchActions";
import { INSET_TOP } from "../../lib/phoneNav";
import type { SuggestionRow } from "../../lib/searchParse";
import { useUI } from "../../stores/ui";

const ICON_BUTTON =
  "absolute top-0 z-10 grid h-12 w-12 place-items-center rounded-full text-ink-2 motion-safe:transition-colors hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)]";

type PhoneSearchFieldProps = {
  listening: boolean;
  onRecognise: () => void;
};

export function PhoneSearchField({ listening, onRecognise }: PhoneSearchFieldProps) {
  const query = useUI((state) => state.searchQuery);
  const setSearchQuery = useUI((state) => state.setSearchQuery);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rows = useTypeAhead(query, focused);
  const open = focused && rows.length > 0;

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
    if (query.trim()) submitSearch(query);
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
    <div
      className="sticky z-20 -mx-4 bg-base px-4 py-2"
      style={{ top: INSET_TOP }}
    >
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-10 grid h-12 w-12 place-items-center text-ink-2">
          <PhoneIcon icon={Search01Icon} />
        </span>
        <input
          ref={inputRef}
          id="phone-search"
          type="search"
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
          className={`h-12 w-full rounded-[12px] border-0 bg-elevated pl-12 text-[16px] text-ink-1 [corner-shape:squircle] placeholder:text-ink-2 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-search-cancel-button]:appearance-none ${query ? "pr-24" : "pr-12"}`}
        />
        {query && (
          <button type="button" aria-label="Clear search" title="Clear search" onClick={clear} className={`${ICON_BUTTON} right-12`}>
            <PhoneIcon icon={Cancel01Icon} />
          </button>
        )}
        <button
          type="button"
          aria-label="Recognise song"
          title="Recognise song"
          disabled={listening}
          onClick={onRecognise}
          className={`${ICON_BUTTON} right-0`}
        >
          <PhoneIcon icon={Mic01Icon} />
        </button>
        <AnimatePresence>
          {open && (
            <SearchSuggestions
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
    </div>
  );
}
