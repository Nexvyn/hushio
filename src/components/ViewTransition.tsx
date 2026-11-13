import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DURATION_MS, reducedMotion } from "../lib/motion";

type Slot = { key: string; node: ReactNode; id: number };
type Stage = { key: string; outgoing: Slot | null; id: number };

type ViewTransitionProps = {
  routeKey: string;
  className?: string;
  children: ReactNode;
};

export function ViewTransition({ routeKey, className = "", children }: ViewTransitionProps) {
  const [stage, setStage] = useState<Stage>({ key: routeKey, outgoing: null, id: 0 });
  const lastNode = useRef<ReactNode>(children);

  let outgoing = stage.outgoing;
  let id = stage.id;
  if (stage.key !== routeKey) {
    const reduced = reducedMotion();
    id = stage.id + 1;
    outgoing = reduced ? null : { key: stage.key, node: lastNode.current, id };
    setStage({ key: routeKey, outgoing, id });
  }

  useLayoutEffect(() => {
    lastNode.current = children;
  });

  useEffect(() => {
    if (!outgoing) return;
    const outgoingId = outgoing.id;
    const timer = window.setTimeout(() => {
      setStage((state) => (state.outgoing?.id === outgoingId ? { ...state, outgoing: null } : state));
    }, DURATION_MS.pageOut);
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  const reduced = reducedMotion();
  const enter = reduced ? "" : "bt-page-in";
  const leave = reduced ? "" : "bt-page-out";

  return (
    <div className="relative">
      {[
        outgoing && (
          <div
            key={outgoing.key}
            aria-hidden="true"
            inert
            className={`pointer-events-none absolute inset-x-0 top-0 ${className} ${leave}`}
          >
            {outgoing.node}
          </div>
        ),
        <div key={routeKey} className={`${className} ${enter}`}>
          {children}
        </div>,
      ]}
    </div>
  );
}
