import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { ImageSquare } from "@phosphor-icons/react";
import { PLAYLIST_DESCRIPTION_MAX, useLibrary, type Playlist } from "../stores/library";
import { usePlaylistEdit } from "../stores/playlistEdit";
import { useUI } from "../stores/ui";
import { playlistCoverPick, playlistCoverRemove } from "../lib/bridge";
import { playlistCovers } from "../lib/playlistCover";
import { useFailedCovers } from "../stores/coverErrors";
import { usePhone } from "../lib/usePhone";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { focusRing } from "./HomeShelves";
import { PhoneIcon } from "./phone/PhoneIcon";
import { Sheet } from "./phone/Sheet";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function glyph(icon: typeof ImageSquare, phone: boolean): ReactNode {
  return phone ? <PhoneIcon icon={icon} size={24} /> : <Icon icon={icon} size={20} />;
}

export function PlaylistEditDialog() {
  const id = usePlaylistEdit((state) => state.id);
  const close = usePlaylistEdit((state) => state.close);
  const playlist = useLibrary((state) => (id ? state.playlists.find((item) => item.id === id) : undefined));
  const phone = usePhone();

  useEffect(() => {
    if (!id) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, close]);

  if (!playlist || playlist.remote) return null;
  const form = <PlaylistDetailsForm key={playlist.id} playlist={playlist} phone={phone} onDone={close} />;
  if (phone) {
    return (
      <Sheet label="Edit playlist" onClose={close}>
        <div className="px-5 pb-6">{form}</div>
      </Sheet>
    );
  }
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
        aria-label="Edit playlist"
        className="glass-strong relative max-h-[90vh] w-[min(460px,calc(100vw-48px))] overflow-y-auto rounded-2xl p-6"
      >
        {form}
      </div>
    </div>
  );
}

type FormProps = { playlist: Playlist; phone: boolean; onDone: () => void };

function PlaylistDetailsForm({ playlist, phone, onDone }: FormProps) {
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const failed = useFailedCovers();
  const cover = playlistCovers(playlist, 1, failed)[0] ?? null;

  async function chooseCover() {
    setCoverBusy(true);
    try {
      const path = await playlistCoverPick(playlist.id);
      if (path) useLibrary.getState().editPlaylist(playlist.id, { coverPath: path });
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    } finally {
      setCoverBusy(false);
    }
  }

  async function removeCover() {
    await playlistCoverRemove(playlist.id).catch(() => undefined);
    useLibrary.getState().editPlaylist(playlist.id, { coverPath: null });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError("Give your playlist a name");
      return;
    }
    useLibrary.getState().editPlaylist(playlist.id, { name, description });
    onDone();
  }

  const fieldClass = `${focusRing} mt-1.5 w-full rounded-md bg-wash px-3 text-body text-ink-1 placeholder:text-ink-2`;
  const labelClass = "mt-5 block text-meta font-medium text-ink-2";

  return (
    <form onSubmit={save} noValidate>
      <h2 className="font-display text-lg font-bold text-ink-1">Edit details</h2>
      <div className="mt-5 flex items-start gap-4">
        <div className="h-[120px] w-[120px] shrink-0 overflow-hidden rounded-art bg-wash">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-ink-2">{glyph(ImageSquare, phone)}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col items-start gap-2 pt-1">
          <Button variant="secondary" disabled={coverBusy} onClick={() => void chooseCover()} className="h-9 min-h-9 px-4 text-meta">
            Choose photo
          </Button>
          {playlist.coverPath && (
            <Button variant="ghost" onClick={() => void removeCover()} className="h-9 min-h-9 px-4 text-meta">
              Remove photo
            </Button>
          )}
        </div>
      </div>

      <label htmlFor={nameId} className={labelClass}>
        Name
      </label>
      <input
        id={nameId}
        value={name}
        maxLength={100}
        autoFocus={!phone}
        aria-invalid={nameError ? true : undefined}
        aria-describedby={nameError ? `${nameId}-error` : undefined}
        onChange={(event) => {
          setName(event.target.value);
          setNameError(null);
        }}
        className={`${fieldClass} h-10`}
      />
      {nameError && (
        <p id={`${nameId}-error`} role="alert" className="mt-1 text-meta text-danger-text">
          {nameError}
        </p>
      )}

      <label htmlFor={descriptionId} className={labelClass}>
        Description
      </label>
      <textarea
        id={descriptionId}
        value={description}
        rows={3}
        maxLength={PLAYLIST_DESCRIPTION_MAX}
        onChange={(event) => setDescription(event.target.value)}
        className={`${fieldClass} resize-none py-2`}
      />
      <p aria-live="polite" className="mt-1 text-right text-meta tabular-nums text-ink-2">
        {description.length}/{PLAYLIST_DESCRIPTION_MAX}
      </p>

      <div className="mt-5 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}
