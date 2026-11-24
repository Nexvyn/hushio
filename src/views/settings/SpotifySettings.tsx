import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { spotifySetClientId, spotifySignIn, spotifySignOut, spotifyStatus, type SpotifyAccount } from "../../lib/bridge";

export function SpotifySettings() {
  const [account, setAccount] = useState<SpotifyAccount | null>(null);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-body font-medium">Spotify</h3>
          <p role="status" className="text-meta text-ink-2">
            {busy === "signIn" ? "Signing in. Check your browser." : account?.signedIn ? `Connected as ${account.name}`
              : account?.expired ? "Spotify signed you out. Sign in again." : account ? "Disconnected" : ""}
          </p>
        </div>
        {account && (account.signedIn
          ? <Button disabled={!!busy} onClick={() => void update("disconnect")}>Disconnect</Button>
          : <Button disabled={!!busy || !account.configured} onClick={() => void update("signIn")}>Sign in with Spotify</Button>)}
      </div>
      {account && (
        <details>
          <summary className="cursor-pointer text-body">Use your own Spotify app</summary>
          <ol className="my-3 list-decimal space-y-2 pl-5 text-meta text-ink-2">
            <li>Create a Web API app in the Spotify developer dashboard. Spotify Premium is required.</li>
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
