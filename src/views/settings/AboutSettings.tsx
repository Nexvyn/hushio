import { AppLogo } from "../../components/AppLogo";
import { Button } from "../../components/Button";
import { APP_NAME } from "../../lib/app";
import { usePhone } from "../../lib/usePhone";

export const GITHUB_URL = "https://github.com/Nexvyn/hushio";
export const WEBSITE_URL = "https://hushio.nexvyn.dev";

export function AboutHeader({ version }: { version: string | null }) {
  return (
    <div className="flex flex-col items-center px-4 pb-2 pt-4 text-center">
      <AppLogo size={72} />
      <p className="mt-3 font-title text-section font-semibold tracking-[-0.02em] text-ink-1">{APP_NAME}</p>
      {version && <p className="mt-1 text-meta tabular-nums text-ink-2">Version {version}</p>}
      <p className="mt-1 text-meta text-ink-2">Free and open source under GPL-3.0</p>
    </div>
  );
}

export function AboutMaker({ onOpen, onWebsite }: { onOpen: () => void; onWebsite: () => void }) {
  const phone = usePhone();
  const note = (
    <p className="min-w-0 flex-1 text-body leading-[22px] text-ink-2">
      Made by Nexvyn. A free, calm music player with no ads and no servers. Built because music apps got too noisy.
    </p>
  );
  const buttons = (
    <div className="flex shrink-0 gap-2">
      <Button onClick={onOpen}>GitHub</Button>
      <Button onClick={onWebsite}>Website</Button>
    </div>
  );
  if (phone) {
    return (
      <div className="flex flex-col items-start gap-3">
        {note}
        {buttons}
      </div>
    );
  }
  return <div className="flex items-center justify-between gap-4">{note}{buttons}</div>;
}
