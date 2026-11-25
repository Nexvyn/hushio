import { useEffect, useId, useState } from "react";
import { ImportButton as Button } from "./importControls";
import { useAuth } from "../stores/auth";
import { newId, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";
import { ytLikedVideos, ytLinkPlaylist, ytMyPlaylists, ytPlaylistVideos, type YtRemotePlaylist } from "../lib/bridge";
import { plural } from "../lib/plural";
import { remoteVideoTrack, skippedText } from "../lib/ytSync";

type ListState =
  | { status: "loading" }
  | { status: "ready"; playlists: YtRemotePlaylist[] }
  | { status: "error"; message: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function YouTubePlaylists() {
  const signedIn = useAuth((state) => state.account.mode === "google");
  const signingIn = useAuth((state) => state.signingIn);
  const signIn = useAuth((state) => state.signIn);
  const libraryPlaylists = useLibrary((state) => state.playlists);
  const importLinked = useLibrary((state) => state.importLinkedPlaylist);
  const importLikedTracks = useLibrary((state) => state.importLikedTracks);
  const navigate = useNavigation((state) => state.navigate);
  const toast = useUI((state) => state.toast);
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [importingAll, setImportingAll] = useState(false);
  const [likedBusy, setLikedBusy] = useState(false);
  const headingId = useId();

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    setList({ status: "loading" });
    ytMyPlaylists()
      .then((playlists) => {
        if (live) setList({ status: "ready", playlists });
      })
      .catch((error: unknown) => {
        if (live) setList({ status: "error", message: errorText(error) });
      });
    return () => {
      live = false;
    };
  }, [signedIn, attempt]);

  const linked = new Map<string, string>();
  for (const playlist of libraryPlaylists) {
    if (playlist.remote) linked.set(playlist.remote.ytPlaylistId, playlist.id);
  }

  async function importOne(playlist: YtRemotePlaylist): Promise<boolean> {
    setPending((current) => new Set(current).add(playlist.id));
    try {
      const videos = await ytPlaylistVideos(playlist.id);
      const id = linked.get(playlist.id) ?? newId();
      await ytLinkPlaylist(id, playlist.id);
      importLinked(id, playlist.title, playlist.id, videos.map(remoteVideoTrack));
      const skipped = skippedText(Math.max(0, playlist.count - videos.length));
      if (skipped) toast(skipped, "info");
      return true;
    } catch (error) {
      toast(errorText(error), "error");
      return false;
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(playlist.id);
        return next;
      });
    }
  }

  async function importLikedSongs() {
    if (likedBusy) return;
    setLikedBusy(true);
    try {
      const videos = await ytLikedVideos();
      importLikedTracks(videos.map(remoteVideoTrack));
      toast(`Imported ${plural(videos.length, "liked song", "liked songs")}`, "success");
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setLikedBusy(false);
    }
  }

  async function importAll(playlists: YtRemotePlaylist[]) {
    setImportingAll(true);
    let count = 0;
    for (const playlist of playlists) {
      if (linked.has(playlist.id)) continue;
      if (await importOne(playlist)) count += 1;
    }
    setImportingAll(false);
    if (count > 0) toast(`Imported ${plural(count, "playlist", "playlists")}`, "success");
  }

  function renderBody() {
    if (!signedIn) {
      return (
        <div className="mt-0 flex flex-col items-start gap-4">
          <p className="text-body text-ink-2">Sign in with Google to bring in your YouTube playlists</p>
          <Button onClick={() => void signIn()} disabled={signingIn}>
            Sign in
          </Button>
        </div>
      );
    }
    if (list.status === "loading") {
      return (
        <p role="status" className="mt-2 text-body text-ink-2">
          Loading your playlists…
        </p>
      );
    }
    if (list.status === "error") {
      return (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-ink-2">{list.message}</p>
          <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>Try again</Button>
        </div>
      );
    }
    if (list.playlists.length === 0) {
      return <p className="mt-2 text-body text-ink-2">No playlists on your YouTube account yet.</p>;
    }
    return (
      <ul className="mt-2">
        {list.playlists.map((playlist) => {
          const localId = linked.get(playlist.id);
          const busy = pending.has(playlist.id);
          return (
            <li key={playlist.id} className="flex items-center gap-3 py-3">
              {playlist.thumbnail ? (
                <img loading="lazy" decoding="async"
                  src={playlist.thumbnail}
                  alt=""
                  className="size-10 shrink-0 rounded-[10px] object-cover [corner-shape:squircle]"
                />
              ) : (
                <span aria-hidden="true" className="size-10 shrink-0 rounded-[10px] bg-accent/10 [corner-shape:squircle]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-ink-1">{playlist.title}</p>
                <p className="text-meta tabular-nums text-ink-2">{plural(playlist.count, "song", "songs")}</p>
              </div>
              {localId ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-meta text-ink-2">Imported</span>
                  <Button variant="ghost" disabled={busy || importingAll} onClick={() => void importOne(playlist)}>
                    {busy ? "Refreshing..." : "Refresh"}
                  </Button>
                  <Button variant="ghost" onClick={() => navigate({ name: "playlist", param: localId })}>
                    Open
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  className="shrink-0"
                  disabled={busy || importingAll}
                  onClick={() => void importOne(playlist)}
                >
                  {busy ? "Importing…" : "Import"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  const ready = list.status === "ready" ? list.playlists : null;
  const remaining = ready?.filter((playlist) => !linked.has(playlist.id)) ?? [];

  return (
    <section aria-labelledby={headingId} className="w-full">
      <div className="flex items-center justify-between gap-4">
        <h3 id={headingId} className="sr-only">
          YouTube playlists
        </h3>
        {signedIn && ready && ready.length > 0 && (
          <Button
            disabled={remaining.length === 0 || importingAll}
            onClick={() => {
              if (ready) void importAll(ready);
            }}
          >
            {importingAll ? "Importing…" : "Import all"}
          </Button>
        )}
      </div>
      {signedIn && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-body text-ink-1">Liked music</p>
          <Button variant="secondary" disabled={likedBusy} onClick={() => void importLikedSongs()}>
            {likedBusy ? "Importing..." : "Import Liked music"}
          </Button>
        </div>
      )}
      {renderBody()}
    </section>
  );
}
