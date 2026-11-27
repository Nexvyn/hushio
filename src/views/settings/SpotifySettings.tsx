import { useEffect, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { spotifySetClientId, spotifySignIn, spotifySignOut, spotifyStatus, type SpotifyAccount } from "../../lib/bridge";
import { spotifyStatusText } from "../../lib/spotifyLibrary";

export function SpotifySettings() {
  const [account, setAccount] = useState<SpotifyAccount | null>(null);
  const [ownAppOpen, setOwnAppOpen] = useState<boolean>();
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState<"signIn" | "save" | "disconnect" | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    spotifyStatus().then((next) => {
      if (live) {
        setAccount(next);
        setClientId(next.ownClientId ?? "");
        setOwnAppOpen(!next.configured);
      }
    }).catch(() => {
      if (live) setMessage("Couldn't read your Spotify settings.");
    });
    return () => { live = false; };
  }, []);

  async function update(action: "signIn" | "disconnect" | "save") {
    setBusy(action);
    setMessage("");
    try {
      const next = action === "save" ? await spotifySetClientId(clientId.trim())
        : action === "disconnect" ? await spotifySignOut() : await spotifySignIn();
      setAccount(next);
      setClientId(next.ownClientId ?? "");
      if (action === "save") setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function copyRedirect() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.redirectUri);
      setCopied(true);
    } catch {
      setMessage("Select the redirect URI and copy it.");
    }
  }

  const value = clientId.trim();
  const invalid = value.length > 0 && !/^[a-f0-9]{32}$/i.test(value);
  return (
    <section aria-label="Spotify" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-medium">Spotify</h3>
          <p role="status" className="text-meta text-ink-2">
            {spotifyStatusText(account, busy === "signIn")}
          </p>
        </div>
        {account?.signedIn && (
          <div className="shrink-0">
            <Button disabled={!!busy} onClick={() => void update("disconnect")}>Disconnect</Button>
          </div>
        )}
        {account && !account.signedIn && account.configured && (
          <div className="shrink-0">
            <Button disabled={!!busy} onClick={() => void update("signIn")}>Sign in with Spotify</Button>
          </div>
        )}
      </div>
      {account && (
        <details className="group" open={ownAppOpen}>
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 text-body [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">Use your own Spotify app</span>
            <span className="shrink-0 group-open:rotate-180">
              <Icon icon={CaretDown} />
            </span>
          </summary>
          <ol className="my-3 list-decimal space-y-2 pl-5 text-meta text-ink-2">
            <li>Create a Web API app in the Spotify developer dashboard. Spotify Premium is needed.</li>
            <li>Add this redirect URI to the app settings.
              <div className="flex flex-wrap items-center gap-2">
                <code className="select-all break-all">{account.redirectUri}</code>
                <Button onClick={() => void copyRedirect()}>{copied ? "Copied" : "Copy"}</Button>
              </div>
            </li>
            <li>Add your Spotify account under User Management. Paste the app's Client ID below and save.</li>
          </ol>
          <label className="block text-meta">Client ID
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} disabled={!!busy}
              spellCheck={false} autoCapitalize="none" autoComplete="off" aria-invalid={invalid}
              className="my-1 block w-full rounded-lg border border-separator bg-surface px-3 py-2 text-body" />
          </label>
          <p className="mb-2 text-meta text-ink-2">
            {invalid ? "Enter 32 hexadecimal characters." : "Leave blank to use the built-in app. Changing apps signs you out."}
          </p>
          <Button disabled={!!busy || invalid || value === (account.ownClientId ?? "")} onClick={() => void update("save")}>Save</Button>
        </details>
      )}
      {message && <p role="status" className="text-meta">{message}</p>}
    </section>
  );
}
