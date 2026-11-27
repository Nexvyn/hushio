import { Archive } from "@phosphor-icons/react";
import { AnimatePresence } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { OWNED_DROP } from "./FileDrop";
import { PageHeader } from "./PageHeader";
import { ExportPanel } from "./ExportPanel";
import { Icon } from "./Icon";
import { ImportButton, ImportModal } from "./importControls";
import { ImportGlyph } from "./importGlyphs";
import { PhoneIcon } from "./phone/PhoneIcon";
import { SpotifyLibrary } from "./SpotifyLibrary";
import { YouTubePlaylists } from "./YouTubePlaylists";
import { readImportText, spotifyStatus } from "../lib/bridge";
import { exportBackup } from "../lib/importBackup";
import { importFiles, importFromText, pendingImport, type ImportFile } from "../lib/importStage";
import { usePhone } from "../lib/usePhone";
import { useAuth } from "../stores/auth";
import { useNavigation } from "../stores/navigation";

const FILE_TYPES = ".csv,.txt,.m3u8,.m3u,.json";
const MAX_LINES = 6;

type Modal = "paste" | "spotify" | "youtube" | "export";

const TITLES: Record<Modal, string> = {
  paste: "Paste a link or list",
  spotify: "Spotify",
  youtube: "YouTube",
  export: "Export a playlist",
};

function fitHeight(field: HTMLTextAreaElement) {
  const style = getComputedStyle(field);
  const frame = field.offsetHeight - field.clientHeight;
  field.style.height = "auto";
  const natural = field.scrollHeight + frame;
  const limit =
    parseFloat(style.lineHeight) * MAX_LINES + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + frame;
  field.style.height = `${Math.min(natural, limit)}px`;
  field.style.overflowY = natural > limit ? "auto" : "hidden";
}

type ActionRowProps = {
  glyph: (playing: boolean) => ReactNode;
  title: string;
  description: string;
  action: ReactNode;
};

function ActionRow({ glyph, title, description, action }: ActionRowProps) {
  const phone = usePhone();
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={phone ? "flex min-h-[64px] items-center gap-4" : "grid min-h-[64px] grid-cols-[24px_minmax(0,1fr)_144px] items-center gap-4"}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span className="relative grid w-6 shrink-0 place-items-center text-ink-2">{glyph(!phone && hovered)}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-body font-medium text-ink-1">{title}</h3>
        <p className="truncate text-meta text-ink-2">{description}</p>
      </div>
      <div className={phone ? "shrink-0" : "flex justify-end [&>button]:w-full"}>{action}</div>
    </div>
  );
}

export function ImportPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const youtubeConnected = useAuth((state) => state.account.mode === "google");
  const fileInput = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigation((state) => state.navigate);
  const phone = usePhone();
  const labelId = useId();
  const hintId = useId();
  const importHeading = useId();
  const exportHeading = useId();

  useEffect(() => {
    let live = true;
    spotifyStatus()
      .then((next) => {
        if (live) setSpotifyConnected(next.signedIn);
      })
      .catch(() => {
        if (live) setSpotifyConnected(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (field.current) fitHeight(field.current);
  }, [text, modal]);

  function openResult(id: string) {
    if (pendingImport(id)) navigate({ name: "import", param: id });
    else navigate({ name: "playlist", param: id });
  }

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const id = await importFromText(text);
    setBusy(false);
    if (id) {
      setModal(null);
      openResult(id);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  async function importFileList(load: () => Promise<ImportFile[]>) {
    if (busy) return;
    setBusy(true);
    const files = await load();
    const id = files.length > 0 ? await importFiles(files) : null;
    setBusy(false);
    if (id) openResult(id);
  }

  function readPicked(picked: File[]): Promise<ImportFile[]> {
    return Promise.all(picked.map(async (file) => ({ name: file.name, text: await file.text() })));
  }

  async function readNativePaths(paths: string[]): Promise<ImportFile[]> {
    const loaded = await Promise.all(
      paths.map(async (path) => {
        try {
          return { name: path.split(/[\\/]/).pop() ?? path, text: await readImportText(path) };
        } catch {
          return null;
        }
      }),
    );
    return loaded.filter((file): file is ImportFile => file !== null);
  }

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    function onOwnedDrop(event: Event) {
      const paths = (event as CustomEvent<{ paths: string[] }>).detail.paths;
      void importFileList(() => readNativePaths(paths));
    }
    element.addEventListener(OWNED_DROP, onOwnedDrop);
    return () => element.removeEventListener(OWNED_DROP, onOwnedDrop);
  });

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length > 0) void importFileList(() => readPicked(picked));
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (modal !== null || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragOver(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    void importFileList(() => readPicked(Array.from(event.dataTransfer.files)));
  }

  const pasteForm = (
    <form onSubmit={onSubmit}>
      <label htmlFor={labelId} className="sr-only">
        Playlist or songs
      </label>
      <textarea
        id={labelId}
        ref={field}
        rows={1}
        aria-describedby={hintId}
        value={text}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Paste a playlist link or a list of songs"
        className="block w-full resize-none rounded-[12px] bg-wash px-4 py-3 text-body leading-relaxed text-ink-1 placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
      <p id={hintId} className="mt-2 text-meta text-ink-2">
        Spotify or Apple Music links, or one song per line as Artist - Title. Up to 5000 songs.
      </p>
      <ImportButton type="submit" className="mt-4 w-full" disabled={!text.trim() || busy}>
        {busy ? "Reading…" : "Import"}
      </ImportButton>
    </form>
  );

  return (
    <div
      ref={root}
      data-owns-drop
      className={`mx-auto max-w-[680px] rounded-[12px] pb-16 motion-safe:transition-shadow motion-safe:duration-quick ${dragOver ? "ring-2 ring-accent" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <PageHeader title="Import & export" />
      <p className="mt-2 text-body text-ink-2">Bring playlists in from other apps, or save yours out.</p>

      <section aria-labelledby={importHeading} className="mt-10">
        <h2 id={importHeading} className="text-meta font-semibold text-ink-2">
          Import
        </h2>
        {dragOver && (
          <p role="status" className="mt-4 text-meta text-ink-2">
            Drop to import
          </p>
        )}
        <div className="mt-4 flex flex-col gap-4">
          <ActionRow
            glyph={() => <ImportGlyph kind="paste" phone={phone} />}
            title="Paste a link or list"
            description="Spotify or Apple Music links, or one song per line as Artist - Title."
            action={<ImportButton onClick={() => setModal("paste")}>Paste</ImportButton>}
          />
          <ActionRow
            glyph={() => <ImportGlyph kind="file-in" phone={phone} />}
            title="Import a file"
            description="CSV, M3U8, TXT or JSON. Export from exportify.app or takeout.google.com."
            action={
              <ImportButton variant="secondary" onClick={() => fileInput.current?.click()}>
                Choose file
              </ImportButton>
            }
          />
          <ActionRow
            glyph={() => <ImportGlyph kind="stream" phone={phone} />}
            title="Spotify"
            description={
              spotifyConnected
                ? "Connected. Pick playlists or Liked Songs to bring in."
                : "Your playlists and Liked Songs."
            }
            action={
              <ImportButton variant="secondary" onClick={() => setModal("spotify")}>
                {spotifyConnected ? "Choose playlists" : "Connect"}
              </ImportButton>
            }
          />
          <ActionRow
            glyph={() => <ImportGlyph kind="youtube" phone={phone} />}
            title="YouTube"
            description={
              youtubeConnected
                ? "Pick playlists to bring in and keep in sync."
                : "Sign in with Google to bring in your playlists."
            }
            action={
              <ImportButton variant="secondary" onClick={() => setModal("youtube")}>
                {youtubeConnected ? "Choose playlists" : "Sign in"}
              </ImportButton>
            }
          />
        </div>
        {busy && (
          <p role="status" className="mt-4 text-meta text-ink-2">
            Reading your list…
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={FILE_TYPES}
          aria-label="Choose a playlist file"
          className="hidden"
          onChange={onFileChange}
        />
      </section>

      <section aria-labelledby={exportHeading} className="mt-10">
        <h2 id={exportHeading} className="text-meta font-semibold text-ink-2">
          Export
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          <ActionRow
            glyph={() => (phone ? <PhoneIcon icon={Archive} /> : <Icon icon={Archive} />)}
            title="Back up your library"
            description="Playlists, liked songs, folders and settings in one file."
            action={
              <ImportButton variant="secondary" onClick={() => void exportBackup()}>
                Back up
              </ImportButton>
            }
          />
          <ActionRow
            glyph={() => <ImportGlyph kind="file-out" phone={phone} />}
            title="Export a playlist"
            description="Save one playlist as M3U8 or JSON."
            action={
              <ImportButton variant="secondary" onClick={() => setModal("export")}>
                Export
              </ImportButton>
            }
          />
        </div>
      </section>

      <AnimatePresence>
        {modal && (
          <ImportModal key={modal} title={TITLES[modal]} onClose={() => setModal(null)}>
            {modal === "paste" && pasteForm}
            {modal === "spotify" && <SpotifyLibrary />}
            {modal === "youtube" && <YouTubePlaylists />}
            {modal === "export" && <ExportPanel />}
          </ImportModal>
        )}
      </AnimatePresence>
    </div>
  );
}
