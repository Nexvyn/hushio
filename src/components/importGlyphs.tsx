import { motion, type TargetAndTransition } from "motion/react";
import { ClipboardText, DownloadSimple, MusicNotes, Play, UploadSimple, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { DURATION_MS, EASE_IN_OUT, EASE_OUT, reducedMotion } from "../lib/motion";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";

export type GlyphKind = "stream" | "youtube" | "file-in" | "file-out" | "paste";
type PartName = "noteA" | "noteB" | "ring" | "arrowDown" | "arrowUp";
type Pose = { x?: number; y?: number; scale?: number; opacity: number };
type Part = { rest: Pose; track: { y?: number[]; scale?: number[]; opacity: number[] }; delay: number };

const NOTE: Part = { rest: { y: 0, opacity: 0 }, track: { y: [1, -4, -8], opacity: [0, 1, 0] }, delay: 0 };

const PARTS: Record<PartName, Part> = {
  noteA: NOTE,
  noteB: { ...NOTE, delay: DURATION_MS.progress / 1000 },
  ring: { rest: { scale: 1, opacity: 0 }, track: { scale: [0.85, 1.5], opacity: [0.6, 0] }, delay: 0 },
  arrowDown: { rest: { y: 0, opacity: 1 }, track: { y: [0, 2, 0], opacity: [1, 1, 1] }, delay: 0 },
  arrowUp: { rest: { y: 0, opacity: 1 }, track: { y: [0, -2, 0], opacity: [1, 1, 1] }, delay: 0 },
};

export type GlyphMotion = { initial: Pose; animate?: TargetAndTransition };

export function glyphMotion(part: PartName, playing: boolean, loop: boolean, reduced: boolean): GlyphMotion {
  const { rest, track, delay } = PARTS[part];
  if (reduced) return { initial: rest };
  if (!playing) return { initial: rest, animate: { ...rest, transition: { duration: DURATION_MS.hover / 1000, ease: EASE_OUT } } };
  return {
    initial: rest,
    animate: {
      ...track,
      transition: { duration: DURATION_MS.spin / 1000, delay, ease: EASE_IN_OUT, repeat: loop ? Infinity : 0 },
      transitionEnd: rest,
    },
  };
}

const ICONS: Record<GlyphKind, PhosphorIcon> = {
  "file-in": DownloadSimple,
  "file-out": UploadSimple,
  stream: MusicNotes,
  youtube: Play,
  paste: ClipboardText,
};

export function ImportGlyph({ kind, phone, playing, loop }: { kind: GlyphKind; phone: boolean; playing: boolean; loop: boolean }) {
  const reduced = reducedMotion();
  const glyph = phone ? <PhoneIcon icon={ICONS[kind]} /> : <Icon icon={ICONS[kind]} />;

  if (kind === "file-in" || kind === "file-out") {
    const part = kind === "file-in" ? "arrowDown" : "arrowUp";
    return (
      <motion.span className="inline-grid" {...glyphMotion(part, playing, loop, reduced)}>
        {glyph}
      </motion.span>
    );
  }
  return (
    <>
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border-[1.5px] border-current"
        {...glyphMotion("ring", playing, loop, reduced)}
      />
      {glyph}
    </>
  );
}
