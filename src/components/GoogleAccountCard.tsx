import { Loading03Icon, UserIcon } from "@hugeicons/core-free-icons";
import type { GoogleAccount } from "../lib/bridge";
import { Button } from "./Button";
import { Icon } from "./Icon";

type GoogleAccountCardProps = {
  account: GoogleAccount;
  signingIn: boolean;
  onSignIn: () => void;
  onCancelSignIn: () => void;
};

const KEYRING_NOTE =
  "No keyring found, so Hushio can't keep you signed in. Install GNOME Keyring or KWallet, then sign in again.";

export function GoogleAccountCard({ account, signingIn, onSignIn, onCancelSignIn }: GoogleAccountCardProps) {
  const keyringNote = account.keyringAvailable ? null : <p className="text-[12.5px] leading-snug text-ink-2">{KEYRING_NOTE}</p>;

  if (account.mode === "google") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {account.pictureUrl ? (
            <img
              src={account.pictureUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-wash text-ink-2">
              <Icon icon={UserIcon} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-ink-1">{account.name ?? "Google account"}</p>
            {account.email && <p className="truncate text-[12.5px] text-ink-2">{account.email}</p>}
          </div>
        </div>
        {keyringNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[14px] font-semibold text-ink-1">Using Hushio as a guest</p>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
          Your library stays on this computer. Sign in with Google to back it up to your YouTube account and Google
          Drive.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {signingIn ? (
          <>
            <Button disabled className="gap-2">
              <span className="grid place-items-center bt-spin">
                <Icon icon={Loading03Icon} />
              </span>
              Waiting for Google…
            </Button>
            <Button variant="ghost" onClick={onCancelSignIn}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={!account.configured} onClick={onSignIn}>
            Sign in with Google
          </Button>
        )}
      </div>
      {!account.configured && (
        <p className="text-[12.5px] leading-snug text-ink-2">Google sign-in isn't available in this build.</p>
      )}
      <p className="text-[12px] leading-snug text-ink-2">
        Optional. Syncs your playlists and Liked Songs to your YouTube account, and your settings to your Google Drive.
        Everything else stays on this computer.
      </p>
      {keyringNote}
    </div>
  );
}
