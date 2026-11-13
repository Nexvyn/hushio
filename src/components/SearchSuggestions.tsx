import { useEffect, useState, type MouseEvent } from "react";
import { motion } from "motion/react";
import { ArrowUpLeft01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Artwork, TYPE_LABEL } from "./SearchRows";
import { Icon } from "./Icon";
import { FLOAT_ROW } from "../lib/floatStyle";
import { GOO_LAYER_STYLE, GOO_SHAPE, gooVariants } from "./Goo";
import { reducedMotion } from "../lib/motion";
import { peekTypeAhead, typeAhead } from "../lib/search";
import type { SuggestionRow } from "../lib/searchParse";
import { joinSubtitle } from "../lib/subtitle";

const TYPE_AHEAD_DEBOUNCE_MS = 160;
const MIN_QUERY = 2;
const MAX_ROWS = 8;

export function useTypeAhead(query: string, enabled: boolean): SuggestionRow[] {
  const trimmed = query.trim();
  const active = enabled && trimmed.length >= MIN_QUERY;
  const [settled, setSettled] = useState<{ key: string; rows: SuggestionRow[] }>({ key: "", rows: [] });

  useEffect(() => {
    if (!active) return;
    const cached = peekTypeAhead(trimmed);
    if (cached) {
      setSettled({ key: trimmed, rows: cached });
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      typeAhead(trimmed).then(
        (rows) => {
          if (live) setSettled({ key: trimmed, rows });
        },
        () => {
          if (live) setSettled({ key: trimmed, rows: [] });
        },
      );
    }, TYPE_AHEAD_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [trimmed, active]);

  return active && settled.key === trimmed ? settled.rows.slice(0, MAX_ROWS) : [];
}

export const optionId = (listId: string, index: number) => `${listId}-option-${index}`;

const rowClass = (active: boolean) => `${FLOAT_ROW} cursor-pointer ${active ? "bg-wash" : "hover:bg-wash active:bg-pressed"}`;

function richSubtitle(row: Extract<SuggestionRow, { kind: "track" | "browse" }>): string {
  if (row.kind === "track") return joinSubtitle(row.track.isVideo ? "Video" : "Song", row.track.artist);
  return joinSubtitle(TYPE_LABEL[row.item.type], row.item.subtitle);
}

function richTitle(row: Extract<SuggestionRow, { kind: "track" | "browse" }>): string {
  return row.kind === "track" ? row.track.title : row.item.title;
}

function richThumb(row: Extract<SuggestionRow, { kind: "track" | "browse" }>): string | null {
  return row.kind === "track" ? row.track.thumb : row.item.thumb;
}

type SearchSuggestionsProps = {
  listId: string;
  query: string;
  rows: SuggestionRow[];
  activeIndex: number;
  onPick: (row: SuggestionRow) => void;
  onFill: (text: string) => void;
  onSubmitTyped: () => void;
};

export function SearchSuggestions({
  listId,
  query,
  rows,
  activeIndex,
  onPick,
  onFill,
  onSubmitTyped,
}: SearchSuggestionsProps) {
  const typed = query.trim();
  const keepFocus = (event: MouseEvent) => event.preventDefault();
  const reduced = reducedMotion();
  const { stretch, reveal } = gooVariants(reduced);
  return (
    <motion.div
      id={listId}
      role="listbox"
      aria-label="Search suggestions"
      initial={reduced ? false : "initial"}
      animate="animate"
      exit="exit"
      className="no-scrollbar pointer-events-none absolute left-0 right-0 top-0 z-50"
    >
      <div aria-hidden="true" data-goo-layer="" className="pointer-events-none absolute inset-0" style={GOO_LAYER_STYLE}>
        <div className={`${GOO_SHAPE} top-0 h-10`} />
        <motion.div variants={stretch} data-goo-panel="" className={`${GOO_SHAPE} bottom-0 top-10 origin-top`} />
      </div>
      <motion.div variants={reveal} className="pointer-events-none relative pt-10">
      <div className="pointer-events-auto relative p-2">
      <div
        id={optionId(listId, 0)}
        role="option"
        aria-selected={activeIndex === 0}
        onMouseDown={keepFocus}
        onClick={onSubmitTyped}
        className={`${rowClass(activeIndex === 0)} w-full`}
      >
        <span className="text-ink-2">
          <Icon icon={Search01Icon} />
        </span>
        <span className="min-w-0 truncate text-[14px] font-medium text-ink-1">{`Search “${typed}”`}</span>
      </div>
      {rows.map((row, index) => {
        const active = activeIndex === index + 1;
        if (row.kind === "completion") {
          return (
            <div key={`completion:${row.text}`} className="flex items-center gap-1">
              <div
                id={optionId(listId, index + 1)}
                role="option"
                aria-selected={active}
                onMouseDown={keepFocus}
                onClick={() => onPick(row)}
                className={rowClass(active)}
              >
                <span className="text-ink-2">
                  <Icon icon={Search01Icon} />
                </span>
                <span className="min-w-0 truncate text-[14px] text-ink-1">{row.text}</span>
              </div>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                title="Fill in"
                aria-label={`Fill in "${row.text}"`}
                onMouseDown={keepFocus}
                onClick={() => onFill(row.text)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-wash hover:text-ink-1 active:bg-pressed"
              >
                <Icon icon={ArrowUpLeft01Icon} />
              </button>
            </div>
          );
        }
        return (
          <div
            key={`${row.kind}:${row.kind === "track" ? row.track.id : row.item.browseId}`}
            id={optionId(listId, index + 1)}
            role="option"
            aria-selected={active}
            onMouseDown={keepFocus}
            onClick={() => onPick(row)}
            className={`${rowClass(active)} w-full`}
          >
            <Artwork src={richThumb(row)} round={row.kind === "browse" && row.item.type === "artist"} size="h-9 w-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink-1">{richTitle(row)}</span>
              <span className="block truncate text-[12px] leading-tight text-ink-2">{richSubtitle(row)}</span>
            </span>
          </div>
        );
      })}
      </div>
      </motion.div>
    </motion.div>
  );
}
