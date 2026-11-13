import { useEffect, useState } from "react";

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(isVisible);
  useEffect(() => {
    const onChange = () => setVisible(isVisible());
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
