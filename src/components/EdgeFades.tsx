import { useRef, type ReactNode } from "react";
import { useEdgeFades } from "../lib/edgeFades";

type EdgeFadesProps = {
  axis?: "x" | "y";
  className?: string;
  id?: string;
  children: ReactNode;
};

export function EdgeFades({ axis = "y", className = "", id, children }: EdgeFadesProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEdgeFades(ref, axis);
  return (
    <div
      ref={ref}
      id={id}
      className={`edge-fades overlay-scroll ${axis === "x" ? "overflow-x-auto" : "overflow-y-auto"} ${className}`}
    >
      {children}
    </div>
  );
}
