import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { type SelectMode, useSelection } from "../stores/selection";

export function modeOf(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): SelectMode {
  if (event.shiftKey) return "range";
  return event.ctrlKey || event.metaKey ? "toggle" : "replace";
}

export function useTrackSelection(listId: string, order: readonly string[]) {
  const ids = useSelection((state) => state.lists[listId]?.ids);
  const selected = new Set(ids ?? []);
  const picked = order.filter((id) => selected.has(id));
  return {
    selected,
    picked,
    count: selected.size,
    isSelected: (id: string) => selected.has(id),
    click: (event: ReactMouseEvent, id: string) => {
      useSelection.getState().select(listId, id, order, modeOf(event));
    },
    contextSelect: (id: string) => {
      if (!selected.has(id)) useSelection.getState().select(listId, id, order, "replace");
    },
    clear: () => useSelection.getState().clear(listId),
    onListKeyDown: (event: ReactKeyboardEvent<HTMLElement>, onDelete?: () => void) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        useSelection.getState().selectAll(listId, order);
        return;
      }
      if (event.key === "Escape" && selected.size > 0) {
        event.preventDefault();
        useSelection.getState().clear(listId);
        return;
      }
      if (event.key === "Delete" && onDelete && selected.size > 0) {
        event.preventDefault();
        onDelete();
      }
    },
  };
}
