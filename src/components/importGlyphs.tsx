import { ClipboardText, DownloadSimple, MusicNotes, Play, UploadSimple, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";

export type GlyphKind = "stream" | "youtube" | "file-in" | "file-out" | "paste";

const ICONS: Record<GlyphKind, PhosphorIcon> = {
  "file-in": DownloadSimple,
  "file-out": UploadSimple,
  stream: MusicNotes,
  youtube: Play,
  paste: ClipboardText,
};

export function ImportGlyph({ kind, phone }: { kind: GlyphKind; phone: boolean }) {
  const glyph = phone ? <PhoneIcon icon={ICONS[kind]} /> : <Icon icon={ICONS[kind]} />;
  if (kind === "file-in" || kind === "file-out") return <span className="inline-grid">{glyph}</span>;
  return glyph;
}
