import { useEffect, useId, useState } from "react";
import { ImportButton as Button } from "./importControls";
import { spotifyStatus, type SpotifyAccount } from "../lib/bridge";
import { stageImport } from "../lib/importStage";
import { plural } from "../lib/plural";
import { LIKED_NAME, loadPlaylists, loadSource, type SpotifyPlaylist, type SpotifySource } from "../lib/spotifyLibrary";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const LIKED_KEY = "liked";
const UNAVAILABLE = "Spotify sign-in isn't available right now.";

type AccountState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; account: SpotifyAccount };

type ListState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; playlists: SpotifyPlaylist[] }
  | { status: "error"; message: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SpotifyLibrary() {
  const navigate = useNavigation((state) => state.navigate);
  const toast = useUI((state) => state.toast);
  const dismissToast = useUI((state) => state.dismissToast);
  const [account, setAccount] = useState<AccountState>({ status: "loading" });
  const [lists, setLists] = useState<ListState>({ status: "idle" });
  const [reading, setReading] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const headingId = useId();

  const signedIn = account.status === "ready" && account.account.signedIn;

  useEffect(() => {
    let live = true;
    spotifyStatus()
      .then((next) => {
        if (live) setAccount({ status: "ready", account: next });
      })
      .catch(() => {
        if (live) setAccount({ status: "unavailable" });
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setLists({ status: "idle" });
      return;
    }
    let live = true;
    setLists({ status: "loading" });
    loadPlaylists()
      .then((playlists) => {
        if (live) setLists({ status: "ready", playlists });
      })
      .catch((error: unknown) => {
        if (live) setLists({ status: "error", message: errorText(error) });
        void spotifyStatus().then((next) => {
          if (live) setAccount({ status: "ready", account: next });
        }).catch(() => {});
      });
    return () => {
      live = false;
    };
  }, [signedIn, attempt]);

  async function importSource(key: string, source: SpotifySource) {
    setReading(key);
    const loading = toast("Reading the playlist…");
    try {
      const list = await loadSource(source);
      const id = stageImport({ ...list, fromSpotify: true });
      navigate({ name: "import", param: id });
    } catch (error) {
      toast(errorText(error), "error");
      const next = await spotifyStatus().catch(() => null);
      if (next) setAccount({ status: "ready", account: next });
    } finally {
      dismissToast(loading);
      setReading(null);
    }
  }

  function renderAccount() {
    if (account.status === "loading") return null;
    if (account.status === "ready" && account.account.signedIn) {
      return <p className="text-body text-ink-2">Connected as {account.account.name}</p>;
    }
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-2">
          {account.status === "unavailable" ? UNAVAILABLE : account.account.expired
            ? "Spotify signed you out. Sign in again." : "Connect Spotify in Account settings to import your library."}
        </p>
        <Button onClick={() => navigate({ name: "settings", param: "account" })}>Account settings</Button>
      </div>
    );
  }

  function renderRow(key: string, source: SpotifySource, name: string, subtitle: string, thumb: string | null) {
    const busy = reading === key;
    return (
      <li key={key} className="flex items-center gap-3 py-3">
        {thumb ? (
          <img loading="lazy" decoding="async" src={thumb} alt="" className="size-10 shrink-0 rounded-[10px] object-cover [corner-shape:squircle]" />
        ) : (
          <span aria-hidden="true" className="size-10 shrink-0 rounded-[10px] bg-accent/10 [corner-shape:squircle]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-body text-ink-1">{name}</p>
          <p className="text-meta tabular-nums text-ink-2">{subtitle}</p>
        </div>
        <Button variant="secondary" className="shrink-0" disabled={reading !== null} onClick={() => void importSource(key, source)}>
          {busy ? "Reading…" : "Import"}
        </Button>
      </li>
    );
  }

  function renderLists() {
    if (!signedIn) return null;
    if (lists.status === "loading" || lists.status === "idle") {
      return (
        <p role="status" className="mt-2 text-body text-ink-2">
          Loading your playlists…
        </p>
      );
    }
    if (lists.status === "error") {
      return (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-ink-2">{lists.message}</p>
          <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>Try again</Button>
        </div>
      );
    }
    return (
      <ul className="mt-2">
        {renderRow(LIKED_KEY, { kind: "liked" }, LIKED_NAME, "Your saved songs", null)}
        {lists.playlists.map((playlist) =>
          renderRow(
            `playlist:${playlist.id}`,
            { kind: "playlist", playlist },
            playlist.name,
            plural(playlist.total, "song", "songs"),
            playlist.thumb,
          ),
        )}
      </ul>
    );
  }

  return (
    <section aria-labelledby={headingId} className="w-full">
      <h3 id={headingId} className="sr-only">
        From your account
      </h3>
      {renderAccount()}
      {renderLists()}
    </section>
  );
}
