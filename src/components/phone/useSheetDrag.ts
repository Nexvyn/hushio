import { useRef, useState, type PointerEvent, type RefObject } from "react";
import { type PointerHandlers } from "../../lib/usePointerSwipe";
import { sheetCloses, sheetTravel } from "../../lib/touchGesture";

type Session = { startY: number; lastY: number; lastT: number; velocity: number };
type Drag = { y: number; live: boolean };

export function useSheetDrag(
  sheet: RefObject<HTMLElement | null>,
  onClose: () => void,
  canStart: (event: PointerEvent) => boolean,
) {
  const session = useRef<Session | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const handlers: PointerHandlers = {
    onPointerDown(event: PointerEvent) {
      if (!canStart(event)) return;
      session.current = { startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0 };
    },
    onPointerMove(event: PointerEvent) {
      const current = session.current;
      if (!current) return;
      const elapsed = event.timeStamp - current.lastT;
      if (elapsed > 0) current.velocity = ((event.clientY - current.lastY) / elapsed) * 1000;
      current.lastY = event.clientY;
      current.lastT = event.timeStamp;
      setDrag({ y: sheetTravel(event.clientY - current.startY), live: true });
    },
    onPointerUp(event: PointerEvent) {
      const current = session.current;
      session.current = null;
      if (!current) return;
      const travel = sheetTravel(event.clientY - current.startY);
      const height = sheet.current?.getBoundingClientRect().height || window.innerHeight;
      if (sheetCloses(travel, height, current.velocity)) {
        setDrag((previous) => (previous ? { y: previous.y, live: false } : null));
        onClose();
      } else {
        setDrag(null);
      }
    },
    onPointerCancel() {
      session.current = null;
      setDrag(null);
    },
  };
  return { handlers, offset: drag?.y ?? 0, live: drag?.live ?? false };
}
