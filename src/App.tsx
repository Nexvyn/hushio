import { useEffect, useState } from "react";
import { Button } from "./components/Button";
import { applyTheme, type ThemeMode } from "./lib/theme";

const modes: ThemeMode[] = ["dark", "light", "system"];

export default function App() {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  return (
    <main spellCheck={false} className="flex min-h-screen items-center justify-center gap-2">
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
    </main>
  );
}
