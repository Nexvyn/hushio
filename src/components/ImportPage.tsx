import { PageHeader } from "./PageHeader";
import { useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "./Button";
import { YouTubePlaylists } from "./YouTubePlaylists";
import { importFiles, importFromText, pendingImport } from "../lib/importStage";
import { useNavigation } from "../stores/navigation";

const FILE_TYPES = ".csv,.txt,.m3u8,.m3u,.json";
const HOW_TO_SUMMARY = "rounded-[6px] text-[14px] font-medium text-ink-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const HOW_TO_BODY = "mt-2 text-[13px] leading-relaxed text-ink-2";
const HOW_TO_PANEL = "rounded-[12px] border border-separator bg-panel px-4 py-3";

export function ImportPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigation((state) => state.navigate);
  const labelId = useId();
  const hintId = useId();

  function openResult(id: string) {
    if (pendingImport(id)) navigate({ name: "import", param: id });
    else navigate({ name: "playlist", param: id });
  }

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const id = await importFromText(text);
    setBusy(false);
    if (id) openResult(id);
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

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0 || busy) return;
    setBusy(true);
    const files = await Promise.all(picked.map(async (file) => ({ name: file.name, text: await file.text() })));
    const id = await importFiles(files);
    setBusy(false);
    if (id) openResult(id);
  }

  return (
    <div className="pb-16">
      <div>
        <PageHeader title="Import" />
        <p className="mt-2 max-w-prose text-body text-ink-2">
          Bring in a playlist or a list of songs. Each song is matched before you save it.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 max-w-[672px]">
        <label htmlFor={labelId} className="text-[13px] font-medium text-ink-1">
          Playlist link
        </label>
        <textarea
          id={labelId}
          aria-describedby={hintId}
          value={text}
          rows={8}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Paste a playlist link, or one song per line as Artist - Title"
          className="mt-2 w-full resize-none rounded-[12px] border border-separator bg-panel p-3 text-[16px] leading-relaxed text-ink-1 placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <p id={hintId} className="mt-2 text-[12px] text-ink-2">
          Paste a playlist or album link from Spotify or Apple Music, a Spotify song link, or one song per line as
          Artist - Title. Up to 5000 songs.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button type="submit" variant="primary" disabled={!text.trim() || busy}>
            {busy ? "Reading…" : "Import"}
          </Button>
          <Button type="button" onClick={() => fileInput.current?.click()}>
            Open file
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={FILE_TYPES}
            aria-label="Choose a playlist file"
            className="hidden"
            onChange={(event) => void onFileChange(event)}
          />
        </div>
      </form>

      <div className="mt-6 flex max-w-[672px] flex-col gap-2">
        <details className={HOW_TO_PANEL}>
          <summary className={HOW_TO_SUMMARY}>From YouTube Music</summary>
          <p className={HOW_TO_BODY}>
            Export at takeout.google.com (choose YouTube and YouTube Music), unzip, pick the CSV files in the playlists
            folder.
          </p>
        </details>
        <details className={HOW_TO_PANEL}>
          <summary className={HOW_TO_SUMMARY}>From Spotify</summary>
          <p className={HOW_TO_BODY}>Export at exportify.app, pick the CSV files.</p>
        </details>
      </div>

      <YouTubePlaylists />
    </div>
  );
}
