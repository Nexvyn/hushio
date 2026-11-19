import { useEffect, useState } from "react";
import { Copy, Trash } from "@phosphor-icons/react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useCrashes, type CrashLog } from "../../stores/crashes";
import { useNavigation } from "../../stores/navigation";
import { PageHeader } from "./SettingsLayout";

function formatCrashTime(at: number): string {
  return new Date(at * 1000).toLocaleString();
}

export function crashText(log: CrashLog): string {
  return `${formatCrashTime(log.at)}\n${log.message}`;
}

export function CrashLogs() {
  const logs = useCrashes((state) => state.logs);
  const loaded = useCrashes((state) => state.loaded);
  const fetchCrashes = useCrashes((state) => state.fetchCrashes);
  const clearCrashes = useCrashes((state) => state.clearCrashes);
  const navigate = useNavigation((state) => state.navigate);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    void fetchCrashes();
  }, [fetchCrashes]);

  async function copy(index: number, log: CrashLog) {
    try {
      await navigator.clipboard.writeText(crashText(log));
      setCopied(index);
    } catch (error) {
      console.error("Could not copy the crash log", error);
    }
  }

  return (
    <div className="max-w-[680px] pb-8">
      <PageHeader
        title="Crash logs"
        note="Recent crashes recorded by Hushio. Copy one to share it, or clear them when you are done."
        onBack={() => navigate({ name: "settings", param: "about" })}
      />

      {!loaded ? (
        <p className="py-3 text-body text-ink-2">Loading crash logs...</p>
      ) : logs.length === 0 ? (
        <p className="py-3 text-body text-ink-2">No crashes recorded</p>
      ) : (
        <ul className="divide-y divide-separator">
          {logs.map((log, index) => (
            <li key={`${log.at}-${index}`} className="py-3">
              <div className="flex min-h-10 items-center justify-between gap-3">
                <span className="text-meta tabular-nums text-ink-2">{formatCrashTime(log.at)}</span>
                <Button
                  variant="ghost"
                  className="gap-2"
                  onClick={() => void copy(index, log)}
                  aria-label={`Copy crash from ${formatCrashTime(log.at)}`}
                >
                  <Icon icon={Copy} />
                  {copied === index ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-meta text-ink-1">{log.message}</pre>
            </li>
          ))}
        </ul>
      )}

      {logs.length > 0 && (
        <div className="mt-6">
          <Button className="gap-2" onClick={() => void clearCrashes()}>
            <Icon icon={Trash} />
            Clear all logs
          </Button>
        </div>
      )}
    </div>
  );
}
