import { DURATION_MS } from "./motion";

export type Rect = { left: number; top: number; width: number; height: number };

export type FlightPlan = { dx: number; dy: number; scale: number; lift: number };

export function flightPlan(from: Rect, to: Rect, targetSize = 24): FlightPlan {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = Math.min(1, Math.max(0.3, targetSize / Math.max(1, from.width)));
  const lift = Math.min(120, Math.abs(dy) * 0.35 + 24);
  return { dx, dy, scale, lift };
}

export function flightKeyframes(plan: FlightPlan): Keyframe[] {
  const midScale = (1 + plan.scale) / 2;
  return [
    { transform: "translate(0px, 0px) scale(1)", opacity: 1, offset: 0 },
    { transform: `translate(${plan.dx / 2}px, ${plan.dy / 2 - plan.lift}px) scale(${midScale})`, opacity: 0.9, offset: 0.5 },
    { transform: `translate(${plan.dx}px, ${plan.dy}px) scale(${plan.scale})`, opacity: 0.3, offset: 1 },
  ];
}

const FLIGHT_MS = 420;

const TARGET_SELECTOR = '[data-fly-target="queue"], [data-mini-cover]';

function findFlightTarget(root: ParentNode = document): HTMLElement | null {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>(TARGET_SELECTOR))) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) return node;
  }
  return null;
}

export function flyToQueue(from: Rect, art: string, reduced: boolean): void {
  if (reduced || typeof document === "undefined" || typeof HTMLElement.prototype.animate !== "function") return;
  const target = findFlightTarget();
  if (!target) return;
  const plan = flightPlan(from, target.getBoundingClientRect());
  const ghost = document.createElement("img");
  ghost.src = art;
  ghost.alt = "";
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    objectFit: "cover",
    borderRadius: "8px",
    pointerEvents: "none",
    zIndex: "120",
    transformOrigin: "center",
  });
  document.body.appendChild(ghost);
  const flight = ghost.animate(flightKeyframes(plan), { duration: FLIGHT_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
  flight.onfinish = () => {
    ghost.remove();
    target.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }],
      { duration: DURATION_MS.settle * 0.6, easing: "ease-out" },
    );
  };
}
