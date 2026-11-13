import { useEffect, useState } from "react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useCrashes } from "../../stores/crashes";
import { appGetIcon, appSetIcon } from "../../lib/bridge";
import { PageHeader } from "./SettingsLayout";

interface AppIcon {
  path: string;
  name: string;
}

const AVAILABLE_ICONS: AppIcon[] = [
  { path: "/icons/icon.ico", name: "Default" },
  { path: "/icons/24x24.png", name: "24x24" },
  { path: "/icons/32x32.png", name: "32x32" },
  { path: "/icons/48x48.png", name: "48x48" },
  { path: "/icons/64x64.png", name: "64x64" },
  { path: "/icons/128x128.png", name: "128x128" },
  { path: "/icons/512x512.png", name: "512x512" },
];

export function AppIconPicker() {
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { closeAppIconPickerDialog } = useCrashes();

  useEffect(() => {
    appGetIcon()
      .then((currentIcon: string) => {
        setSelected(currentIcon);
      })
      .catch(() => {
        setSelected("/icons/icon.ico");
      });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setError(null);

    try {
      await appSetIcon(selected);
      closeAppIconPickerDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set app icon");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[680px] pb-8">
      <PageHeader
        title="App icon"
        note="Choose which icon to display in the window and taskbar."
        onBack={closeAppIconPickerDialog}
      />

      <ul className="divide-y divide-separator">
        {AVAILABLE_ICONS.map((icon) => {
          const picked = selected === icon.path;
          return (
            <li key={icon.path}>
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => setSelected(icon.path)}
                className="flex min-h-[52px] w-full items-center gap-4 py-2 text-left motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <img
                  src={icon.path}
                  alt=""
                  aria-hidden="true"
                  className="h-8 w-8 shrink-0 object-contain"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
                <span className={`min-w-0 flex-1 text-body font-medium ${picked ? "text-ink-1" : "text-ink-2"}`}>
                  {icon.name}
                </span>
                {picked && (
                  <span className="shrink-0 text-ink-1">
                    <Icon icon={Tick02Icon} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-4 text-meta text-danger-text">{error}</p>}

      <div className="mt-6 flex items-center gap-2">
        <Button variant="primary" onClick={handleSave} disabled={loading || !selected}>
          {loading ? "Setting..." : "Set app icon"}
        </Button>
        <Button variant="ghost" onClick={closeAppIconPickerDialog} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
