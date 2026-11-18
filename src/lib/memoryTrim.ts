type Trim = () => void;

const trims = new Set<Trim>();

export function onMemoryTrim(trim: Trim): void {
  trims.add(trim);
}

function trimMemory(): void {
  for (const trim of trims) trim();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") trimMemory();
  });
}
