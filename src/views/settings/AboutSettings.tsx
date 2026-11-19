import { AppLogo } from "../../components/AppLogo";
import { Button } from "../../components/Button";
import { APP_NAME } from "../../lib/app";

export const GITHUB_URL = "https://github.com/Nexvyn";

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

export function AboutMaker({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-body leading-[22px] text-ink-2">
        Made by Nexvyn. A free, calm music player with no ads and no servers. Built because music apps got too noisy.
      </p>
      <Button onClick={onOpen}>GitHub</Button>
    </div>
  );
}
