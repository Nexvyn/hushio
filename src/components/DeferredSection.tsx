import { useEffect, useRef, useState, type ReactNode } from "react";

export function DeferredSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const height = useRef(300);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") return;
    const resize = new ResizeObserver(() => { if (node.childElementCount) height.current = node.getBoundingClientRect().height; });
    const observer = new IntersectionObserver(entries => {
      const entry = entries[0];
      if (entry && !entry.isIntersecting && node.childElementCount) height.current = node.getBoundingClientRect().height;
      if (entry) setVisible(entry.isIntersecting || node.contains(document.activeElement));
    }, { root: document.getElementById("view-scroll"), rootMargin: "1200px 0px" });
    observer.observe(node); resize.observe(node);
    return () => { observer.disconnect(); resize.disconnect(); };
  }, []);
  return <div ref={ref} style={visible ? undefined : { height: height.current }} data-feed-window="true">{visible ? children : null}</div>;
}
