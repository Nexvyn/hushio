import { Fragment, useState } from "react";
import { AnimatePresence } from "motion/react";
import { CaretRight, Check } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { RowThumb } from "../RowThumb";
import { SongInfoSheet } from "../SongInfoSheet";
import { Sheet } from "./Sheet";
import { PressRow } from "./PressRow";
import type { MenuItem, ContextMenuState } from "../../stores/ui";
import { useUI } from "../../stores/ui";

function subjectOf(items: MenuItem[]) {
  return items.find((item) => item.subject)?.subject ?? null;
}

const SLOT = "grid size-6 shrink-0 place-items-center";

function MenuRow({ item, onActivate, indent }: { item: MenuItem; onActivate: (item: MenuItem) => void; indent?: boolean }) {
  const tone = item.danger ? "text-danger-text" : "text-ink-1";
  const trailing = item.checked === true ? Check : item.children ? CaretRight : null;
  return (
    <PressRow label={item.label} className={`h-14 px-4 ${item.disabled ? "opacity-[var(--disabled-opacity)]" : ""}`} onPress={() => !item.disabled && onActivate(item)}>
      <span className={`flex h-full w-full items-center gap-3 text-meta font-normal ${tone} ${indent ? "pl-6" : ""}`}>
        <span className={SLOT}>{item.icon && <PhoneIcon icon={item.icon} />}</span>
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.note && <span className="truncate text-caption text-ink-2">{item.note}</span>}
        <span className={SLOT}>{trailing && <PhoneIcon icon={trailing} />}</span>
      </span>
    </PressRow>
  );
}

function MenuBody({ menu }: { menu: ContextMenuState }) {
  const close = useUI((state) => state.closeContextMenu);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const items = menu.items;
  const subject = subjectOf(items);
  const rows = items.filter((item) => !item.subject);

  const activate = (item: MenuItem) => {
    if (item.children) {
      const index = rows.indexOf(item);
      setOpenIndex((current) => (current === index ? null : index));
      return;
    }
    item.onSelect?.();
    close();
  };

  return (
    <Sheet
      label={subject?.title ?? "Menu"}
      onClose={close}
      header={
        subject && (
          <div className="flex items-center gap-3 pb-2">
            <RowThumb src={subject.thumb} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-meta font-semibold text-ink-1">{subject.title}</p>
              {subject.subtitle && <p className="truncate text-caption text-ink-2">{subject.subtitle}</p>}
            </div>
          </div>
        )
      }
    >
      <div role="menu" className="flex flex-col pb-2">
        {rows.map((item, index) => (
          <Fragment key={`${index}:${item.label}`}>
            {item.separatorBefore && <div aria-hidden="true" className="h-4" />}
            {item.header ? (
              <p className="px-4 pb-1 pt-2 text-caption text-ink-2">{item.label}</p>
            ) : (
              <MenuRow item={item} onActivate={activate} />
            )}
            {openIndex === index &&
              item.children?.map((child) => <MenuRow key={child.label} item={child} onActivate={activate} indent />)}
          </Fragment>
        ))}
      </div>
    </Sheet>
  );
}

export function PhoneMenuSheet() {
  const menu = useUI((state) => state.contextMenu);
  return (
    <>
      <AnimatePresence>{menu && <MenuBody key="phone-menu" menu={menu} />}</AnimatePresence>
      <SongInfoSheet />
    </>
  );
}
