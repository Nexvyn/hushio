import { useId, useMemo, useState } from "react";
import logo from "../assets/hushio.svg?raw";
import { brandMarkup } from "../lib/brandMarkup";

type AppLogoProps = { size?: number; launch?: boolean; label?: string; introTarget?: boolean };

export function AppLogo({ size = 40, launch = false, label, introTarget = false }: AppLogoProps) {
  const id = useId();
  const [tapped, setTapped] = useState(false);
  const markup = useMemo(() => brandMarkup(logo, id), [id]);
  return <span className="app-logo" data-motion={launch ? "launch" : tapped ? "tap" : "interactive"} data-intro-target={introTarget || undefined}
    onPointerDown={() => setTapped(true)} onAnimationEnd={(event) => { if (event.animationName === "logo-blink") setTapped(false); }}
    role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: markup }} />;
}
