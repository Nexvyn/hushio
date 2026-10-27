import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextMenu, openMenuAtPointer, openMenuFromKey, type MenuSource } from "./ContextMenu";
import { useUI, type MenuItem } from "../stores/ui";

const initialUI = useUI.getState();

beforeEach(() => {
  useUI.setState({ ...initialUI, contextMenu: null }, true);
});

afterEach(cleanup);

function Harness({ items }: { items: MenuSource }) {
  return (
    <>
      <button
        type="button"
        onContextMenu={(event) => openMenuAtPointer(event, items)}
        onKeyDown={(event) => void openMenuFromKey(event, items)}
      >
        Target
      </button>
      <p>outside</p>
      <ContextMenu />
    </>
  );
}

function sampleItems(onFirst: () => void = () => {}): MenuItem[] {
  return [
    { label: "Play now", onSelect: onFirst },
    { label: "Locked", disabled: true, onSelect: () => {} },
    { label: "Delete", danger: true, separatorBefore: true, onSelect: () => {} },
    { label: "Sing along", onSelect: () => {} },
    { label: "Subject row", subject: { title: "Night Drive", subtitle: "Band", thumb: null } },
  ];
}

function openAt(x: number, y: number, items: MenuItem[] = sampleItems()) {
  render(<Harness items={items} />);
  const target = screen.getByRole("button", { name: "Target" });
  target.focus();
  fireEvent.contextMenu(target, { clientX: x, clientY: y });
  return target;
}

describe("ContextMenu opening", () => {
  it("opens at the pointer on a right-click and labels the menu with the subject title", () => {
    openAt(100, 120);

    const menu = screen.getByRole("menu", { name: "Night Drive" });
    expect(menu.style.left).toBe("100px");
    expect(menu.style.top).toBe("120px");
    expect(screen.queryByRole("menuitem", { name: "Subject row" })).toBeNull();
  });

  it("never opens with no items", () => {
    render(<Harness items={[]} />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Target" }), { clientX: 10, clientY: 10 });

    expect(useUI.getState().contextMenu).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens from the keyboard menu key beside the focused element", () => {
    render(<Harness items={sampleItems()} />);
    const target = screen.getByRole("button", { name: "Target" });
    target.focus();

    fireEvent.keyDown(target, { key: "F10", shiftKey: true });

    expect(screen.getByRole("menu", { name: "Night Drive" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Play now" }));
  });

  it("keeps the menu inside the viewport on the right and bottom edges", () => {
    openAt(1000, 760);

    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe(`${window.innerWidth - 230 - 8}px`);
    expect(menu.style.top).toBe(`${window.innerHeight - 320 - 8}px`);
  });

  it("keeps a menu inside the viewport on the left and top edges", () => {
    openAt(-40, -40);

    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("8px");
    expect(menu.style.top).toBe("8px");
  });

  it("places an above menu above its anchor and never past the top edge", () => {
    render(<Harness items={sampleItems()} />);
    act(() => useUI.getState().openContextMenu(200, 100, sampleItems(), { above: true }));

    const menu = screen.getByRole("menu");
    expect(menu.style.top).toBe("8px");
    expect(menu.style.left).toBe("200px");
  });

  it("hangs a right-aligned menu from its anchor's right edge", () => {
    render(<Harness items={sampleItems()} />);
    act(() => useUI.getState().openContextMenu(400, 50, sampleItems(), { alignRight: true }));

    expect(screen.getByRole("menu").style.left).toBe("170px");
  });

  it("reopens after Escape", async () => {
    const user = userEvent.setup();
    const target = openAt(10, 10);
    await user.keyboard("{Escape}");

    fireEvent.contextMenu(target, { clientX: 10, clientY: 10 });

    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("ContextMenu rows", () => {
  it("runs the chosen row once and closes", async () => {
    const user = userEvent.setup();
    const onFirst = vi.fn();
    openAt(10, 10, sampleItems(onFirst));

    await user.click(screen.getByRole("menuitem", { name: "Play now" }));

    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not run a disabled row", async () => {
    const user = userEvent.setup();
    openAt(10, 10);

    const locked = screen.getByRole("menuitem", { name: "Locked" });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    await user.click(locked);

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("marks danger rows and puts a separator before a row that asks for one", () => {
    openAt(10, 10);

    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-danger")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Play now" }).getAttribute("data-danger")).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete" }).previousElementSibling?.getAttribute("role")).toBe("separator");
  });

  it("shows checked toggles as checkboxes", () => {
    openAt(10, 10, [
      { label: "Mix", toggle: true, checked: true, onSelect: () => {} },
      { label: "Other", toggle: true, checked: false, onSelect: () => {} },
    ]);

    expect(screen.getByRole("menuitemcheckbox", { name: "Mix" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Other" }).getAttribute("aria-checked")).toBe("false");
  });

  it("renders captions as text, not as rows", () => {
    openAt(10, 10, [{ label: "Folder", header: true }, { label: "Work", onSelect: () => {} }]);

    expect(screen.getByText("Folder")).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Folder" })).toBeNull();
  });
});

describe("ContextMenu keyboard", () => {
  it("focuses the first enabled row on open and moves with the arrow keys, wrapping", async () => {
    const user = userEvent.setup();
    openAt(10, 10);

    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Play now" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Sing along" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Play now" }));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Sing along" }));
  });

  it("jumps to the first and last enabled rows with Home and End", async () => {
    const user = userEvent.setup();
    openAt(10, 10);

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Sing along" }));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Play now" }));
  });

  it("moves focus to the next row that starts with the typed letter", async () => {
    const user = userEvent.setup();
    openAt(10, 10, [
      { label: "Play now", onSelect: () => {} },
      { label: "Add to queue", onSelect: () => {} },
      { label: "Play next", onSelect: () => {} },
    ]);

    await user.keyboard("p");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Play next" }));
    await user.keyboard("a");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Add to queue" }));
  });

  it("closes on Escape and returns focus to the element that opened it", async () => {
    const user = userEvent.setup();
    const target = openAt(10, 10);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(target);
  });

  it("closes on Tab", async () => {
    const user = userEvent.setup();
    openAt(10, 10);

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("ContextMenu submenus", () => {
  const submenu: MenuItem[] = [
    {
      label: "Add to playlist",
      children: [
        { label: "Mix", toggle: true, checked: false, onSelect: () => {} },
        { label: "New playlist", separatorBefore: true, onSelect: () => {} },
      ],
    },
    { label: "Play now", onSelect: () => {} },
  ];

  it("opens with ArrowRight, focuses its first row, and folds with ArrowLeft", async () => {
    const user = userEvent.setup();
    openAt(10, 10, submenu);

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("menu", { name: "Add to playlist" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitemcheckbox", { name: "Mix" }));

    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByRole("menu", { name: "Add to playlist" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Add to playlist" }));
  });

  it("folds the submenu on Escape before closing the menu", async () => {
    const user = userEvent.setup();
    openAt(10, 10, submenu);

    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu", { name: "Add to playlist" })).toBeNull();
    expect(screen.getByRole("menu", { name: "Menu" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Add to playlist" }));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs a submenu row and closes everything", async () => {
    const user = userEvent.setup();
    const onMix = vi.fn();
    openAt(10, 10, [{ label: "Add to playlist", children: [{ label: "Mix", onSelect: onMix }] }]);

    await user.keyboard("{ArrowRight}");
    await user.click(screen.getByRole("menuitem", { name: "Mix" }));

    expect(onMix).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on hover and closes after the grace period once the pointer leaves", async () => {
    openAt(10, 10, submenu);

    fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "Add to playlist" }));
    expect(screen.getByRole("menu", { name: "Add to playlist" })).toBeTruthy();

    fireEvent.pointerLeave(screen.getByRole("menu", { name: "Menu" }));
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(screen.queryByRole("menu", { name: "Add to playlist" })).toBeNull();
  });
});

describe("ContextMenu dismissal", () => {
  it("closes on a press outside the menu", async () => {
    const user = userEvent.setup();
    openAt(10, 10);

    await user.click(screen.getByText("outside"));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps the menu open for a press inside it", () => {
    openAt(10, 10);

    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Sing along" }));

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("closes on a wheel outside the menu and ignores a wheel inside it", () => {
    openAt(10, 10);

    fireEvent.wheel(screen.getByRole("menuitem", { name: "Sing along" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.wheel(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
