import { useEffect, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "./components/Button";
import { Icon } from "./components/Icon";
import { gate, glide } from "./lib/motion";
import { applyTheme, type ThemeMode } from "./lib/theme";

const modes: ThemeMode[] = ["dark", "light", "system"];

export default function App() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [moved, setMoved] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  return (
    <main spellCheck={false} className="flex min-h-screen flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-2">
        {modes.map((value) => (
          <Button
            key={value}
            variant={value === mode ? "primary" : "secondary"}
            aria-pressed={value === mode}
            onClick={() => setMode(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button aria-label="Search" className="h-9 w-9 p-0">
          <Icon icon={Search01Icon} />
        </Button>
        <Button onClick={() => setMoved((value) => !value)}>Toggle glide</Button>
      </div>

      <div className="relative h-1 w-48 rounded-full bg-wash">
        <motion.span
          className="absolute top-0 h-1 w-6 rounded-full bg-ink-1"
          animate={{ x: moved ? 168 : 0 }}
          transition={gate(Boolean(reduce), glide)}
        />
      </div>
    </main>
  );
}
