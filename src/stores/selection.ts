import { create } from "zustand";

export type SelectMode = "replace" | "toggle" | "range";
export type ListSelection = { ids: string[]; anchor: string | null };

export function nextSelection(
  current: ListSelection | undefined,
  id: string,
  order: readonly string[],
  mode: SelectMode,
): ListSelection {
  const previous = current ?? { ids: [], anchor: null };
  if (mode === "replace") return { ids: [id], anchor: id };
  if (mode === "toggle") {
    const has = previous.ids.includes(id);
    return {
      ids: has ? previous.ids.filter((item) => item !== id) : [...previous.ids, id],
      anchor: id,
    };
  }
  const from = previous.anchor === null ? -1 : order.indexOf(previous.anchor);
  const to = order.indexOf(id);
  if (from < 0 || to < 0) return { ids: [id], anchor: id };
  const [low, high] = from <= to ? [from, to] : [to, from];
  return { ids: order.slice(low, high + 1), anchor: previous.anchor };
}

type SelectionState = {
  lists: Record<string, ListSelection | undefined>;
  select: (listId: string, id: string, order: readonly string[], mode: SelectMode) => void;
  selectAll: (listId: string, order: readonly string[]) => void;
  clear: (listId: string) => void;
};

export const useSelection = create<SelectionState>()((set) => ({
  lists: {},
  select: (listId, id, order, mode) =>
    set((state) => ({
      lists: { ...state.lists, [listId]: nextSelection(state.lists[listId], id, order, mode) },
    })),
  selectAll: (listId, order) =>
    set((state) => ({
      lists: { ...state.lists, [listId]: { ids: [...order], anchor: order[0] ?? null } },
    })),
  clear: (listId) =>
    set((state) => (state.lists[listId] ? { lists: { ...state.lists, [listId]: undefined } } : state)),
}));

export function selectedIn(listId: string): string[] {
  return useSelection.getState().lists[listId]?.ids ?? [];
}
