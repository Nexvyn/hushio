import {
  Fragment,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight01Icon, CheckIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { useUI, type ContextMenuOptions, type ContextMenuState, type MenuItem, type MenuSubject } from "../stores/ui";
import "../styles/menu.css";

export type MenuSource = MenuItem[] | (() => MenuItem[]);

type Interaction = { preventDefault: () => void; stopPropagation: () => void };
type Point = { x: number; y: number; above: boolean; alignRight: boolean };
type Rect = { left: number; right: number; top: number; bottom: number };
type Placed = { left: number; top: number };
type SubState = { index: number; anchor: Rect };

const ROWS = '[role^="menuitem"]:not(:disabled)';
const PAD = 8;
const GAP = 6;
const SUB_CLOSE_MS = 150;
const MAIN_SIZE = { width: 230, height: 320 };
const SUB_SIZE = { width: 200, height: 340 };
const KEY_ANCHOR_INSET = 16;
const PANEL =
  "fixed z-[100] max-h-[70vh] min-w-[220px] max-w-[320px] overflow-y-auto rounded-2xl bg-elevated p-1.5 shadow-[var(--shadow-menu)] ring-1 ring-card-edge/[0.08]";
const SUB_PANEL =
  "fixed z-[101] max-h-[340px] min-w-[200px] max-w-[320px] overflow-y-auto rounded-2xl bg-elevated p-1.5 shadow-[var(--shadow-menu)] ring-1 ring-card-edge/[0.08]";
const ROW =
  "relative flex min-h-9 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13.5px] text-ink-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)] data-[danger=true]:text-danger-text";

let sheetSeq = 0;

export function resolveMenu(source: MenuSource): MenuItem[] {
  return typeof source === "function" ? source() : source;
}

export function openMenuAtPointer(
  event: Interaction & { clientX: number; clientY: number },
  source: MenuSource,
  options?: ContextMenuOptions,
) {
  event.preventDefault();
  event.stopPropagation();
  useUI.getState().openContextMenu(event.clientX, event.clientY, resolveMenu(source), options);
}

export function openMenuFromKey(
  event: Interaction & { key: string; shiftKey: boolean },
  source: MenuSource,
  options?: ContextMenuOptions,
): boolean {
  if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return false;
  event.preventDefault();
  event.stopPropagation();
  useUI.getState().openContextMenu(0, 0, resolveMenu(source), options);
  return true;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

function rectOf(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
}

function pointFor(menu: ContextMenuState): Point {
  if (menu.x !== 0 || menu.y !== 0) {
    return { x: menu.x, y: menu.y, above: Boolean(menu.above), alignRight: Boolean(menu.alignRight) };
  }
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return { x: 0, y: 0, above: false, alignRight: false };
  const rect = rectOf(focused);
  return { x: rect.left + KEY_ANCHOR_INSET, y: rect.bottom, above: false, alignRight: false };
}

function placeMain(point: Point, width: number, height: number) {
  const left = clamp(point.alignRight ? point.x - width : point.x, PAD, window.innerWidth - width - PAD);
  const top = point.above
    ? Math.max(PAD, point.y - height - GAP)
    : clamp(point.y, PAD, window.innerHeight - height - PAD);
  return { left, top, origin: `${point.above ? "bottom" : "top"} ${point.alignRight ? "right" : "left"}` };
}

function placeSub(anchor: Rect, width: number, height: number) {
  const right = anchor.right + GAP;
  const flipped = right + width > window.innerWidth - PAD;
  return {
    left: flipped ? anchor.left - width - GAP : right,
    top: clamp(anchor.top - GAP, PAD, window.innerHeight - height - PAD),
    flipped,
  };
}

function rowsIn(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(ROWS)) : [];
}

function typeahead(list: HTMLElement[], at: number, key: string) {
  const letter = key.toLocaleLowerCase();
  for (let step = 1; step <= list.length; step++) {
    const candidate = list[(at + step) % list.length];
    if (candidate.dataset.label?.toLocaleLowerCase().startsWith(letter)) {
      candidate.focus({ preventScroll: true });
      return;
    }
  }
}

function roleOf(item: MenuItem): string {
  if (item.checked === undefined) return "menuitem";
  return item.toggle ? "menuitemcheckbox" : "menuitemradio";
}

type PanelProps = {
  rows: MenuItem[];
  subject?: MenuSubject;
  label: string;
  submenu?: boolean;
  above?: boolean;
  flipped?: boolean;
  openIndex?: number;
  byKeys: MutableRefObject<boolean>;
  style: CSSProperties;
  onRowEnter: (index: number, row: HTMLElement) => void;
  onRowActivate: (index: number, row: HTMLElement) => void;
  onPanelEnter?: () => void;
  onPanelLeave?: () => void;
};

const MenuPanel = forwardRef<HTMLDivElement, PanelProps>(function MenuPanel(
  { rows, subject, label, submenu = false, above = false, flipped = false, openIndex, byKeys, style, onRowEnter, onRowActivate, onPanelEnter, onPanelLeave },
  ref,
) {
  const lightRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const setPanel = (node: HTMLDivElement | null) => {
    panelRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const shine = (row: HTMLElement | null) => {
    const light = lightRef.current;
    if (!light) return;
    light.classList.toggle("is-on", row !== null);
    if (!row) return;
    light.style.transform = `translateY(${row.offsetTop}px)`;
    light.style.height = `${row.offsetHeight}px`;
    light.dataset.danger = row.dataset.danger ?? "false";
  };

  const restingRow = (): HTMLElement | null => {
    const panel = panelRef.current;
    if (!panel) return null;
    const expanded = panel.querySelector<HTMLElement>('[aria-expanded="true"]');
    if (expanded) return expanded;
    const focused = document.activeElement;
    return byKeys.current && focused instanceof HTMLElement && panel.contains(focused) && focused.matches(ROWS)
      ? focused
      : null;
  };

  return (
    <div
      ref={setPanel}
      role="menu"
      aria-orientation="vertical"
      aria-label={label}
      data-menu-portal={submenu ? "" : undefined}
      onPointerEnter={onPanelEnter}
      onPointerLeave={() => {
        shine(restingRow());
        onPanelLeave?.();
      }}
      style={style}
      className={`${submenu ? `${SUB_PANEL} menu-sub` : `${PANEL} menu-sheet`}${above ? " is-above" : ""}${flipped ? " is-flipped" : ""}`}
    >
      <span ref={lightRef} aria-hidden="true" className="menu-light" />
      {subject && (
        <>
          <div className="relative mb-1 flex items-center gap-3 overflow-hidden rounded-[10px] px-3 py-2">
            {subject.thumb && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 scale-125 bg-cover opacity-40 blur-2xl"
                style={{ backgroundImage: `url(${JSON.stringify(subject.thumb)})` }}
              />
            )}
            {subject.thumb ? (
              <img
                alt=""
                src={subject.thumb}
                className={`relative h-10 w-10 shrink-0 object-cover ${subject.round ? "rounded-full" : "rounded-lg"}`}
              />
            ) : (
              <span className={`relative h-10 w-10 shrink-0 bg-wash ${subject.round ? "rounded-full" : "rounded-lg"}`} />
            )}
            <span className="relative min-w-0">
              <span className="block truncate text-[14px] font-bold text-ink-1">{subject.title}</span>
              {subject.subtitle && <span className="mt-px block truncate text-[12.5px] text-ink-2">{subject.subtitle}</span>}
            </span>
          </div>
          <div role="separator" className="mx-1 mb-1 h-px bg-separator" />
        </>
      )}
      {rows.map((item, index) => (
        <Fragment key={`${index}:${item.label}`}>
          {item.separatorBefore && index > 0 && <div role="separator" className="my-1 h-px bg-separator" />}
          {item.header ? (
            <div role="presentation" className="px-3 pb-1 pt-2 text-[12px] font-medium text-ink-2">
              {item.label}
            </div>
          ) : (
            <button
              type="button"
              role={roleOf(item)}
              aria-checked={item.checked}
              aria-haspopup={item.children ? "menu" : undefined}
              aria-expanded={item.children ? openIndex === index : undefined}
              data-menu-row=""
              data-menu-index={index}
              data-label={item.label}
              data-danger={item.danger ? "true" : undefined}
              data-has-children={item.children ? "true" : undefined}
              disabled={item.disabled}
              onPointerEnter={(event) => {
                shine(event.currentTarget);
                onRowEnter(index, event.currentTarget);
              }}
              onFocus={(event) => {
                if (byKeys.current) shine(event.currentTarget);
              }}
              onClick={(event) => onRowActivate(index, event.currentTarget)}
              className={ROW}
            >
              {item.icon &&
                (item.note ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-wash">
                    <Icon icon={item.icon} />
                  </span>
                ) : (
                  <Icon icon={item.icon} />
                ))}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {item.note && <span className="block truncate text-[12px] text-ink-2">{item.note}</span>}
              </span>
              {item.checked === true && <Icon icon={CheckIcon} />}
              {item.children && <Icon icon={ArrowRight01Icon} />}
            </button>
          )}
        </Fragment>
      ))}
    </div>
  );
});

function MenuSheet({ menu }: { menu: ContextMenuState }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);
  const openSubRef = useRef<SubState | null>(null);
  const byKeys = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [placed, setPlaced] = useState<(Placed & { origin: string }) | null>(null);
  const [sub, setSubState] = useState<SubState | null>(null);
  const [subPlaced, setSubPlaced] = useState<(Placed & { flipped: boolean }) | null>(null);
  const rows = useMemo(() => menu.items.filter((item) => !item.subject), [menu.items]);
  const subject = menu.items.find((item) => item.subject)?.subject;
  const subRows = sub ? (rows[sub.index]?.children ?? []) : [];

  function setSub(next: SubState | null) {
    openSubRef.current = next;
    setSubState(next);
  }

  function close() {
    useUI.getState().closeContextMenu();
  }

  function clearSubTimer() {
    window.clearTimeout(closeTimer.current);
  }

  function scheduleSubClose() {
    clearSubTimer();
    if (openSubRef.current) closeTimer.current = window.setTimeout(() => setSub(null), SUB_CLOSE_MS);
  }

  function openSub(index: number, row: HTMLElement) {
    clearSubTimer();
    setSub({ index, anchor: rectOf(row) });
  }

  function foldSub() {
    const current = openSubRef.current;
    if (!current) return;
    panelRef.current?.querySelector<HTMLElement>(`[data-menu-index="${current.index}"]`)?.focus({ preventScroll: true });
    setSub(null);
  }

  function enterRow(index: number, row: HTMLElement) {
    clearSubTimer();
    if (rows[index].children) {
      if (openSubRef.current?.index !== index) openSub(index, row);
    } else if (openSubRef.current) {
      setSub(null);
    }
  }

  function activateRow(index: number, row: HTMLElement) {
    const item = rows[index];
    if (item.children) {
      if (openSubRef.current?.index === index) setSub(null);
      else openSub(index, row);
      return;
    }
    item.onSelect?.();
    close();
  }

  function activateSubRow(index: number) {
    subRows[index].onSelect?.();
    close();
  }

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focused = document.activeElement;
    opener.current = focused instanceof HTMLElement ? focused : null;
    setPlaced(placeMain(pointFor(menu), panel.offsetWidth || MAIN_SIZE.width, panel.offsetHeight || MAIN_SIZE.height));
    panel.querySelector<HTMLElement>(ROWS)?.focus({ preventScroll: true });
  }, [menu]);

  useLayoutEffect(() => {
    const panel = subRef.current;
    if (!sub || !panel) {
      setSubPlaced(null);
      return;
    }
    setSubPlaced(placeSub(sub.anchor, panel.offsetWidth || SUB_SIZE.width, panel.offsetHeight || SUB_SIZE.height));
    panel.querySelector<HTMLElement>(ROWS)?.focus({ preventScroll: true });
  }, [sub]);

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (Boolean(panelRef.current?.contains(target)) || (target instanceof Element && target.closest("[data-menu-portal]") !== null));

    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) useUI.getState().closeContextMenu();
    };
    const onPointerCapture = () => {
      byKeys.current = false;
    };
    const onWheel = (event: WheelEvent) => {
      if (!inside(event.target)) useUI.getState().closeContextMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      byKeys.current = true;
      const current = openSubRef.current;
      const focused = document.activeElement;
      const inSub = Boolean(current) && Boolean(subRef.current?.contains(focused));
      const list = rowsIn(inSub ? subRef.current : panelRef.current);
      const at = focused instanceof HTMLElement ? list.indexOf(focused) : -1;

      switch (event.key) {
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          if (current) foldSub();
          else useUI.getState().closeContextMenu();
          return;
        case "Tab":
          event.preventDefault();
          useUI.getState().closeContextMenu();
          return;
        case "ArrowDown":
        case "ArrowUp":
        case "Home":
        case "End": {
          event.preventDefault();
          if (list.length === 0) return;
          const target =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? list.length - 1
                : event.key === "ArrowDown"
                  ? (at + 1) % list.length
                  : at <= 0
                    ? list.length - 1
                    : at - 1;
          list[target].focus({ preventScroll: true });
          return;
        }
        case "ArrowRight": {
          if (inSub || !(focused instanceof HTMLElement) || focused.dataset.hasChildren !== "true") return;
          event.preventDefault();
          const index = Number(focused.dataset.menuIndex);
          if (openSubRef.current?.index !== index) openSub(index, focused);
          return;
        }
        case "ArrowLeft":
          if (!inSub) return;
          event.preventDefault();
          foldSub();
          return;
        default:
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeahead(list, at, event.key);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerdown", onPointerCapture, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerdown", onPointerCapture, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
      const target = opener.current;
      const focused = document.activeElement;
      if (target?.isConnected && (!focused || focused === document.body)) target.focus({ preventScroll: true });
    },
    [],
  );

  return (
    <>
      <MenuPanel
        ref={panelRef}
        rows={rows}
        subject={subject}
        label={subject?.title ?? "Menu"}
        above={menu.above}
        openIndex={sub?.index}
        byKeys={byKeys}
        style={placed ? { left: placed.left, top: placed.top, transformOrigin: placed.origin } : { left: 0, top: 0, visibility: "hidden" }}
        onRowEnter={enterRow}
        onRowActivate={activateRow}
        onPanelEnter={clearSubTimer}
        onPanelLeave={scheduleSubClose}
      />
      {sub &&
        createPortal(
          <MenuPanel
            key={sub.index}
            ref={subRef}
            rows={subRows}
            label={rows[sub.index].label}
            submenu
            flipped={subPlaced?.flipped}
            byKeys={byKeys}
            style={subPlaced ? { left: subPlaced.left, top: subPlaced.top } : { left: 0, top: 0, visibility: "hidden" }}
            onRowEnter={() => {}}
            onRowActivate={activateSubRow}
            onPanelEnter={clearSubTimer}
            onPanelLeave={scheduleSubClose}
          />,
          document.body,
        )}
    </>
  );
}

export function ContextMenu() {
  const menu = useUI((state) => state.contextMenu);
  const sheet = useMemo(() => (menu ? ++sheetSeq : 0), [menu]);
  if (!menu) return null;
  return <MenuSheet key={sheet} menu={menu} />;
}
