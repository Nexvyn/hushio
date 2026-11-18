import type { YtTvCode } from "../lib/bridge";
import { Button } from "./Button";

type YouTubeMusicPromptProps = {
  code: YtTvCode | null;
  busy: boolean;
  error: string | null;
  onOpen: () => void;
  onCancel: () => void;
};

export function YouTubeMusicPrompt({ code, busy, error, onOpen, onCancel }: YouTubeMusicPromptProps) {
  if (code === null) {
    return (
      <div className="flex flex-col gap-2">
        {busy && <p className="text-meta text-ink-2">Connecting…</p>}
        {error && (
          <p role="alert" className="text-meta text-danger-text">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-ink-2">Go to google.com/device and enter this code.</p>
      <p className="select-all text-section font-semibold tracking-[0.12em] text-ink-1">{code.userCode}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={onOpen}>
          Open google.com/device
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
