import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { type LocalTagEdits, type LocalTrack } from "../lib/bridge";
import { focusRing } from "./HomeShelves";
import { Button } from "./Button";
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST } from "../lib/localLibrary";
import { useLocalLibrary } from "../stores/localLibrary";
import { useTrackEdit } from "../stores/trackEdit";
import { useUI } from "../stores/ui";

type TextField = "title" | "artist" | "album" | "albumArtist" | "genre";
type NumberField = "year" | "trackNumber" | "discNumber";
type Values = Record<TextField | NumberField, string>;

const TEXT_FIELDS: TextField[] = ["title", "artist", "album", "albumArtist", "genre"];
const NUMBER_FIELDS: { field: NumberField; label: string }[] = [
  { field: "year", label: "Year" },
  { field: "trackNumber", label: "Track" },
  { field: "discNumber", label: "Disc" },
];
const NUMBER_LABELS: Record<NumberField, string> = {
  year: "Year",
  trackNumber: "Track number",
  discNumber: "Disc number",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function initialValues(track: LocalTrack): Values {
  return {
    title: track.title,
    artist: track.artist === UNKNOWN_ARTIST ? "" : track.artist,
    album: track.album === UNKNOWN_ALBUM ? "" : track.album,
    albumArtist: track.albumArtist ?? "",
    genre: track.genre ?? "",
    year: track.year ? String(track.year) : "",
    trackNumber: track.trackNumber ? String(track.trackNumber) : "",
    discNumber: track.discNumber ? String(track.discNumber) : "",
  };
}

function planEdits(initial: Values, values: Values): LocalTagEdits | string {
  const edits: LocalTagEdits = {};
  for (const field of TEXT_FIELDS) {
    const next = values[field].trim();
    if (next !== initial[field].trim()) edits[field] = next;
  }
  for (const { field } of NUMBER_FIELDS) {
    const next = values[field].trim();
    if (next === initial[field]) continue;
    if (next !== "" && !/^\d+$/.test(next)) return `${NUMBER_LABELS[field]} must be a number.`;
    edits[field] = next === "" ? "" : Number(next);
  }
  return edits;
}

export function TrackEditDialog() {
  const id = useTrackEdit((state) => state.id);
  const track = useLocalLibrary((state) => {
    if (!id) return undefined;
    return state.library.tracks.find((item) => item.id === id) ?? state.opened.find((item) => item.id === id);
  });

  const close = useCallback(() => {
    const target = useTrackEdit.getState().returnTo;
    useTrackEdit.getState().close();
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!id) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, close]);

  if (!track) return null;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))" }}
        onMouseDown={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit info"
        className="glass-strong relative max-h-[90vh] w-[min(460px,calc(100vw-48px))] overflow-y-auto rounded-2xl p-6"
      >
        <TrackEditForm key={track.id} track={track} onDone={close} />
      </div>
    </div>
  );
}

type FormProps = { track: LocalTrack; onDone: () => void };

function TrackEditForm({ track, onDone }: FormProps) {
  const baseId = useId();
  const [initial] = useState(() => initialValues(track));
  const [values, setValues] = useState<Values>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const plan = planEdits(initial, values);
  const changed = typeof plan === "string" || Object.keys(plan).length > 0;

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !changed) return;
    if (typeof plan === "string") {
      setError(plan);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await useLocalLibrary.getState().editTags(track.id, plan);
      useUI.getState().toast("Song info saved", "success");
      onDone();
    } catch (failure) {
      setError(errorText(failure));
      setSaving(false);
    }
  }

  const fieldClass = `${focusRing} mt-1.5 w-full rounded-md bg-wash px-3 text-body text-ink-1 placeholder:text-ink-2`;
  const labelClass = "mt-4 block text-meta font-medium text-ink-2";
  const inputClass = `${fieldClass} h-10`;
  const textInput = (field: TextField, label: string, autoFocus = false) => (
    <>
      <label htmlFor={`${baseId}-${field}`} className={labelClass}>
        {label}
      </label>
      <input
        id={`${baseId}-${field}`}
        value={values[field]}
        maxLength={200}
        autoFocus={autoFocus}
        onChange={(event) => update(field, event.target.value)}
        className={inputClass}
      />
    </>
  );

  return (
    <form onSubmit={(event) => void save(event)} noValidate>
      <h2 className="font-display text-lg font-bold text-ink-1">Edit info</h2>
      {textInput("title", "Title", true)}
      {textInput("artist", "Artist")}
      {textInput("album", "Album")}
      {textInput("albumArtist", "Album artist")}
      {textInput("genre", "Genre")}
      <div className="grid grid-cols-3 gap-3">
        {NUMBER_FIELDS.map(({ field, label }) => (
          <div key={field} className="min-w-0">
            <label htmlFor={`${baseId}-${field}`} className={labelClass}>
              {label}
            </label>
            <input
              id={`${baseId}-${field}`}
              value={values[field]}
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => update(field, event.target.value)}
              className={inputClass}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-meta text-danger-text">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={!changed || saving}>
          Save
        </Button>
      </div>
    </form>
  );
}
