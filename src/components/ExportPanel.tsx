import { useId, useState, type KeyboardEvent } from "react";
import { ImportButton } from "./importControls";
import { exportPlaylist } from "../lib/collectionActions";
import { useLibrary } from "../stores/library";

type Format = "m3u8" | "json";

const FORMATS: { id: Format; label: string }[] = [
  { id: "m3u8", label: "M3U8" },
  { id: "json", label: "JSON" },
];

const SELECT =
  "h-10 min-w-0 w-full rounded-[8px] border border-separator bg-surface px-3 text-body text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function ExportPanel() {
  const playlists = useLibrary((state) => state.playlists);
  const selectId = useId();
  const formatLabel = useId();
  const [choice, setChoice] = useState("");
  const [format, setFormat] = useState<Format>("m3u8");
  const picked = playlists.find((playlist) => playlist.id === choice) ?? playlists[0];

  function onFormatKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const index = (FORMATS.findIndex((item) => item.id === format) + step + FORMATS.length) % FORMATS.length;
    setFormat(FORMATS[index].id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-meta font-medium text-ink-2">
          Playlist
        </label>
        <select
          id={selectId}
          value={picked?.id ?? ""}
          disabled={playlists.length === 0}
          onChange={(event) => setChoice(event.target.value)}
          className={SELECT}
        >
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={formatLabel} className="text-meta font-medium text-ink-2">
          Format
        </span>
        <div role="radiogroup" aria-labelledby={formatLabel} onKeyDown={onFormatKey} className="flex gap-1">
          {FORMATS.map((item) => {
            const selected = item.id === format;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setFormat(item.id)}
                className={`h-8 rounded-[8px] px-3 text-meta font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-safe:transition-colors ${
                  selected ? "bg-ink-1 text-[rgb(var(--base))]" : "text-ink-2 hover:bg-hover hover:text-ink-1"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <ImportButton
          disabled={!picked}
          onClick={() => {
            if (picked) exportPlaylist(picked, format);
          }}
        >
          Export
        </ImportButton>
      </div>
      {playlists.length === 0 && (
        <p className="text-meta text-ink-2">No playlists yet. Make one first, then export it here.</p>
      )}
    </div>
  );
}
