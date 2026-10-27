import { useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "./Button";
import { importFromText, importPlaylistFile } from "../lib/importStage";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const FILE_TYPES = ".csv,.txt,.m3u8,.m3u,.json";
const TEXT_FILE_EXTENSIONS = new Set(["csv", "txt"]);

function baseNameOf(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || "Imported playlist";
}

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function ImportPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigation((state) => state.navigate);
  const labelId = useId();
  const hintId = useId();

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const id = await importFromText(text);
    setBusy(false);
    if (id) navigate({ name: "import", param: id });
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
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const contents = await file.text();
    const extension = extensionOf(file.name);
    if (TEXT_FILE_EXTENSIONS.has(extension)) {
      const id = await importFromText(contents, baseNameOf(file.name));
      if (id) navigate({ name: "import", param: id });
      return;
    }
    const id = importPlaylistFile(contents, baseNameOf(file.name));
    if (id) {
      navigate({ name: "playlist", param: id });
    } else {
      useUI.getState().toast("No YouTube Music songs found in that file", "error");
    }
  }

  return (
    <div className="pb-16">
      <header>
        <h1 className="text-[34px] font-extrabold tracking-[-0.03em] text-ink-1">Import</h1>
        <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-ink-2">
          Bring in a playlist or a list of songs. Each song is matched to YouTube Music before you save it.
        </p>
      </header>

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
          className="mt-2 w-full resize-y rounded-[11px] border border-separator bg-panel p-3 text-[16px] leading-relaxed text-ink-1 placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <p id={hintId} className="mt-2 text-[12px] text-ink-2">
          One song per line, or a CSV export from Exportify or TuneMyMusic. Up to 5000 songs.
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
            accept={FILE_TYPES}
            aria-label="Choose a playlist file"
            className="hidden"
            onChange={(event) => void onFileChange(event)}
          />
        </div>
      </form>
    </div>
  );
}
