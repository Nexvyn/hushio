let height = 0;
let width = 0;
let listening = false;

function read(): void {
  height = window.innerHeight;
  width = window.innerWidth;
}

function listen(): void {
  if (listening) return;
  listening = true;
  read();
  window.addEventListener("resize", read);
  window.visualViewport?.addEventListener("resize", read);
}

export function viewportHeight(): number {
  if (typeof window === "undefined") return 0;
  listen();
  return height;
}

export function viewportWidth(): number {
  if (typeof window === "undefined") return 0;
  listen();
  return width;
}
