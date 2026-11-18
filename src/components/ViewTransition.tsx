import type { ReactNode } from "react";
import { reducedMotion } from "../lib/motion";

type ViewTransitionProps = {
  routeKey: string;
  className?: string;
  children: ReactNode;
};

export function ViewTransition({ routeKey, className = "", children }: ViewTransitionProps) {
  const enter = reducedMotion() ? "" : "bt-page-in";
  return (
    <div className="relative">
      <div key={routeKey} className={`${className} ${enter}`}>
        {children}
      </div>
    </div>
  );
}
