import { useMemo, useState } from "react";
import { DownloadSimple, Play, ListPlus, Plus, ArrowClockwise, Shuffle } from "@phosphor-icons/react";
import { PILL, ROUND } from "./BrowseHero";
import { ActionMenu } from "./ActionMenu";
import { Button } from "./Button";
import { CollectionHero } from "./CollectionHero";
import { ErrorState } from "./ErrorState";
import { Icon } from "./Icon";
import { TrackRow } from "./TrackRow";
import { queueAll } from "../lib/browseActions";
import { downloadAll } from "../lib/downloads";
import { trackMenuItems } from "../lib/trackActions";
import { coversOf } from "../lib/collections";
import { matchLanguageLabel, type MatchLanguage } from "../lib/importLanguage";
import type { ImportSong } from "../lib/importParse";
import { APP_NAME } from "../lib/app";
import { useSongMatches, type MatchState } from "../lib/importMatches";
import { pendingImport, saveImportedPlaylist, type StagedImport } from "../lib/importStage";
import { plural } from "../lib/plural";
import { useBrowsePlayback } from "../lib/useBrowsePlayback";
import { useNavigation } from "../stores/navigation";
import { useSettings } from "../stores/settings";
import { useUI, type MenuItem } from "../stores/ui";

export function ImportMatched({ importId }: { importId: string }) {
  const playlist = useMemo(() => pendingImport(importId), [importId]);
  const prefer = useSettings((state) => state.matchLanguage);
  const [attempt, setAttempt] = useState(0);

  if (!playlist) {
    return (
      <div className="pt-10">
        <ErrorState
          title="Nothing to import"
          message="Import a playlist from the + in Your Library: a Spotify link, a CSV file, or a list of songs."
        />
      </div>
    );
  }
  return (
    <MatchedContent
      playlist={playlist}
      prefer={prefer}
      attempt={attempt}
      onRetry={() => setAttempt((count) => count + 1)}
    />
  );
}

type MatchedContentProps = {
  playlist: StagedImport;
  prefer: MatchLanguage;
  attempt: number;
  onRetry: () => void;
};

function MatchedContent({ playlist, prefer, attempt, onRetry }: MatchedContentProps) {
  const navigate = useNavigation((state) => state.navigate);
  const songs = playlist.songs;
  const states = useSongMatches(songs, prefer, attempt);
  const settled = songs.map((_, index) => states[index]);

  const matched = settled.flatMap((state) => (state?.status === "matched" ? [state.track] : []));
  const finding = settled.filter((state) => state === undefined).length;
  const missing = settled.filter((state) => state?.status === "missing").length;
  const failed = settled.filter((state) => state?.status === "failed").length;
  const done = finding === 0;
  const saveReady = done && matched.length > 0;
  const total = songs.length;

  const positions: number[] = [];
  let cursor = 0;
  for (const state of settled) {
    positions.push(state?.status === "matched" ? cursor : -1);
    if (state?.status === "matched") cursor += 1;
  }

  const { current, playing, playAt, shuffle } = useBrowsePlayback(matched);

  const covers = coversOf([
    { thumb: playlist.thumb ?? null },
    ...songs.map((song) => ({ thumb: song.thumb ?? null })),
    ...(done ? matched.map((track) => ({ thumb: track.thumb })) : []),
  ]);
  const menu: MenuItem[] = [
    {
      label: "Add all to queue",
      icon: ListPlus,
      disabled: matched.length === 0,
      onSelect: () => queueAll(matched, "Added to queue"),
    },
    {
      label: "Download all",
      icon: DownloadSimple,
      disabled: matched.length === 0,
      onSelect: () => downloadAll(matched, playlist.name),
    },
  ];

  function save() {
    const id = saveImportedPlaylist(playlist.name, matched);
    useUI.getState().toast(`Saved “${playlist.name}” to your library`, "success");
    navigate({ name: "playlist", param: id });
  }

  const facts = [
    plural(total, "song", "songs"),
    playlist.owner ? `By ${playlist.owner}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pb-14">
      <CollectionHero
        title={playlist.name}
        covers={covers}
        facts={facts}
      >
        <button
          type="button"
          aria-label={`Play ${playlist.name}`}
          disabled={matched.length === 0}
          onClick={() => playAt(0)}
          className={PILL}
        >
          <Icon icon={Play} />
          Play
        </button>
        <button
          type="button"
          aria-label="Shuffle"
          title="Shuffle"
          disabled={matched.length === 0}
          onClick={shuffle}
          className={ROUND}
        >
          <Icon icon={Shuffle} />
        </button>
        <button
          type="button"
          disabled={!saveReady}
          title={saveReady ? "Save the matched songs as a playlist" : "Available once every song is checked"}
          onClick={save}
          className={PILL}
        >
          <Icon icon={Plus} />
          Save to library
        </button>
        <ActionMenu items={menu} label="More options" triggerClass={ROUND} />
      </CollectionHero>

      <div className="pt-6">
        {playlist.warning && <p role="alert" className="px-3 pb-2 text-meta text-ink-2">{playlist.warning}</p>}
        <p aria-live="polite" className="px-3 pb-2 text-meta text-ink-2">
          {total === 0 ? "" : progressLine(done, total, finding, matched.length, missing, failed)}
        </p>

        {playlist.total > songs.length && (
          <p className="px-3 pb-2 text-meta text-ink-2">
            {`The playlist has ${playlist.total} songs; ${APP_NAME} could read the first ${songs.length}.`}
          </p>
        )}

        {(playlist.malformed ?? 0) > 0 && (
          <p className="px-3 pb-2 text-meta text-ink-2">
            {`${plural(playlist.malformed ?? 0, "row", "rows")} could not be read because a quote is never closed.`}
          </p>
        )}

        {done && failed > 0 && (
          <div className="px-3 pb-2">
            <Button variant="secondary" onClick={onRetry}>
              <Icon icon={ArrowClockwise} />
              Try again
            </Button>
          </div>
        )}

        {total === 0 ? (
          <p className="px-3 py-6 text-body text-ink-2">This playlist has no songs yet.</p>
        ) : (
          <ol>
            {songs.map((song, index) => {
              const state = settled[index];
              if (state?.status === "matched") {
                return (
                  <TrackRow
                    key={`${song.spotifyId ?? song.title}-${index}`}
                    index={index}
                    song={state.track}
                    current={state.track.id === current}
                    playing={playing}
                    menu={() => trackMenuItems(state.track)}
                    onPlay={() => playAt(positions[index])}
                    artwork
                  />
                );
              }
              return <SourceRow key={`${song.spotifyId ?? song.title}-${index}`} index={index} song={song} state={state} />;
            })}
          </ol>
        )}

        {prefer && (
          <p className="max-w-[672px] px-3 pt-6 text-meta text-ink-2">
            {`Prefers ${matchLanguageLabel(prefer)} versions of a song where several are available (Settings › Connected services).`}
          </p>
        )}
      </div>
    </div>
  );
}

function progressLine(
  done: boolean,
  total: number,
  finding: number,
  matched: number,
  missing: number,
  failed: number,
): string {
  if (!done) return `Finding ${total - finding} of ${total} songs…`;
  let line = `${matched} of ${total} songs found`;
  if (missing === 1) line += ". 1 isn't there";
  else if (missing > 1) line += `. ${missing} aren't there`;
  if (failed > 0) line += `. ${failed} couldn't be checked`;
  return `${line}.`;
}

function statusText(state: MatchState | undefined): string {
  if (state === undefined) return "Finding…";
  return state.status === "missing" ? "Not found" : "Couldn't check";
}

function SourceRow({ song, state, index }: { song: ImportSong; state: MatchState | undefined; index: number }) {
  return (
    <li className="flex h-16 items-center gap-3 px-3 opacity-45">
      <span className="w-7 shrink-0 text-center text-meta tabular-nums text-ink-2">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-ink-1">{song.title}</p>
        {song.artist && <p className="truncate text-meta text-ink-2">{song.artist}</p>}
      </div>
      <span className="shrink-0 text-meta text-ink-2">{statusText(state)}</span>
    </li>
  );
}
