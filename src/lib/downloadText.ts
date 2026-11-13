const REVOKE_DELAY_MS = 1000;
const INVALID_FILE_NAME_CHARS = /[<>:"\/\\|?*\u0000-\u001f]/g;

export function safeFileName(name: string): string {
  return name.replace(INVALID_FILE_NAME_CHARS, "_").trim() || "playlist";
}

export function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
